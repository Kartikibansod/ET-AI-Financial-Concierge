from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import os
import re
import time
from datetime import datetime
from html import unescape
from io import BytesIO
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
from dotenv import load_dotenv
import httpx
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from groq import Groq
except ImportError:
    Groq = None

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

# Enable CORS for all routes
CORS(app)

# Initialize Groq client lazily so the app still works without the SDK installed.
groq_api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if Groq and groq_api_key else None
supabase_url = os.getenv("SUPABASE_URL", "").strip()
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()

ET_OFFERINGS = {
    "prime": {
        "title": "ET Prime",
        "url": "https://economictimes.indiatimes.com/prime",
        "tag": "Premium Insights"
    },
    "markets": {
        "title": "ET Markets",
        "url": "https://economictimes.indiatimes.com/markets",
        "tag": "Market Tracking"
    },
    "mf": {
        "title": "ET Mutual Funds",
        "url": "https://economictimes.indiatimes.com/mf",
        "tag": "Fund Research"
    },
    "wealth": {
        "title": "ET Wealth",
        "url": "https://economictimes.indiatimes.com/wealth",
        "tag": "Personal Finance"
    },
    "news": {
        "title": "ET News",
        "url": "https://economictimes.indiatimes.com/news",
        "tag": "Daily News"
    },
    "webinars": {
        "title": "ET Webinars & Masterclasses",
        "url": "https://economictimes.indiatimes.com/webinars",
        "tag": "Learning"
    },
    "masterclass": {
        "title": "ET Masterclass",
        "url": "https://economictimes.indiatimes.com/masterclass",
        "tag": "Deep Learning"
    },
    "events": {
        "title": "ET Corporate Events",
        "url": "https://timesevents.com/",
        "tag": "Corporate Events"
    },
    "wealth_summits": {
        "title": "ET Wealth Summits",
        "url": "https://economictimes.indiatimes.com/topic/wealth+summit",
        "tag": "Wealth Summits"
    },
    "cards": {
        "title": "ET Credit Cards",
        "url": "https://economictimes.indiatimes.com/topic/credit-card",
        "tag": "Cards"
    },
    "loans": {
        "title": "ET Loans & Borrowing",
        "url": "https://economictimes.indiatimes.com/wealth/borrow/",
        "tag": "Loans"
    },
    "insurance": {
        "title": "ET Insurance",
        "url": "https://economictimes.indiatimes.com/wealth/insure/",
        "tag": "Insurance"
    },
    "wealth_management": {
        "title": "ET Wealth Management",
        "url": "https://economictimes.indiatimes.com/wealth/invest",
        "tag": "Wealth Management"
    },
    "services": {
        "title": "ET Financial Services",
        "url": "https://economictimes.indiatimes.com/wealth",
        "tag": "Partner Services"
    },
}

LIVE_DATA_TTL_SECONDS = int(os.getenv("ET_LIVE_CACHE_TTL", "300"))
LIVE_DATA_CACHE = {
    "expires_at": 0,
    "data": {}
}
MODEL_CACHE_TTL_SECONDS = int(os.getenv("GROQ_MODEL_CACHE_TTL", "3600"))
MODEL_CACHE = {
    "expires_at": 0,
    "model": None
}
ET_LIVE_SOURCES = {
    "markets_rss": "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    "wealth_rss": "https://economictimes.indiatimes.com/wealth/rssfeeds/837555174.cms",
    "masterclass": "https://economictimes.indiatimes.com/masterclass?utm_source=et_l1",
}
PREFERRED_GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "llama-3.1-8b-instant",
]
VALID_MODES = {"chat", "research", "simplify", "alerts", "highlights", "summarize"}
VALID_SIMPLIFY_LEVELS = {"basic", "medium", "advanced"}
VALID_LANGUAGES = {"english", "hindi", "marathi"}

def normalize_profile(profile):
    """Normalize questionnaire data from the browser."""
    profile = profile or {}
    return {
        "user_type": str(profile.get("user_type") or profile.get("type") or "Student").title(),
        "goal": str(profile.get("goal") or profile.get("intent") or "Learn").title(),
        "risk": str(profile.get("risk") or "Medium").title(),
    }


def detect_personality(profile):
    """Map questionnaire profile to a simple user personality."""
    risk = (profile.get("risk") or "").lower()
    if risk == "low":
        return "Risk-Averse Planner"
    if risk == "medium":
        return "Balanced Learner"
    if risk == "high":
        return "Aggressive Explorer"
    return "Beginner Saver"


def normalize_mode(mode):
    mode = str(mode or "chat").strip().lower()
    return mode if mode in VALID_MODES else "chat"


def normalize_simplify_level(level):
    level = str(level or "basic").strip().lower()
    return level if level in VALID_SIMPLIFY_LEVELS else "basic"


def normalize_language(language):
    language = str(language or "english").strip().lower()
    return language if language in VALID_LANGUAGES else "english"


def get_current_date_label():
    return datetime.now().strftime("%B %d, %Y")


def decision_agent(profile, section):
    """Return section-based focus areas and UI categories."""
    section = (section or "investment").lower()

    if section == "investment":
        return {
            "categories": ["Investment", "ET Markets", "ET Prime", "ET Wealth", "Partner Services"],
            "focus": "stocks, SIP, ET Markets, ET Prime, ET Wealth, and partner financial services"
        }
    if section == "learning":
        return {
            "categories": ["Learning", "ET Masterclass", "ET Prime", "Corporate Events", "Wealth Summits"],
            "focus": "courses, basics, ET Masterclass, ET Prime, corporate events, and wealth summits"
        }
    return {
        "categories": ["News", "Economic Times", "ET Prime", "ET Markets", "Corporate Events"],
        "focus": "trends, updates, Economic Times, ET Prime, ET Markets, and corporate events"
    }


def get_experience_level(profile):
    level = str(profile.get("level") or "").strip().title()
    if level:
        return level

    user_type = str(profile.get("user_type") or "").lower()
    if "investor" in user_type:
        return "Intermediate"
    return "Beginner"


def get_missing_areas(profile):
    gaps = []
    goal = str(profile.get("goal") or "").lower()

    if not str(profile.get("income") or "").strip() and ("invest" in goal or "save" in goal):
        gaps.append("You have not mapped monthly investing capacity yet.")
    if get_experience_level(profile) == "Beginner":
        gaps.append("You still need stronger finance basics before bigger decisions.")
    if not str(profile.get("risk") or "").strip():
        gaps.append("Your risk comfort is not fully defined yet.")

    return gaps or ["You have not shared any current investments yet."]


def fetch_rss_items(url, limit=5):
    """Fetch latest RSS items from an ET feed."""
    response = httpx.get(url, timeout=8, follow_redirects=True)
    response.raise_for_status()
    root = ET.fromstring(response.text)
    channel = root.find("channel")

    items = []
    if channel is None:
        return items

    for item in channel.findall("item")[:limit]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        if title and link:
            items.append({
                "title": unescape(title),
                "url": link,
                "published_at": pub_date
            })

    return items


def slug_to_title(url):
    path = urlparse(url).path.rstrip("/")
    slug = path.split("/")[-1] if path else "masterclass"
    slug = re.sub(r"[-_]+", " ", slug).strip()
    return slug.title() if slug else "ET Masterclass"


def fetch_masterclass_items(limit=5):
    """Fetch current ET Masterclass session links from the live page."""
    response = httpx.get(ET_LIVE_SOURCES["masterclass"], timeout=8, follow_redirects=True)
    response.raise_for_status()
    html = response.text

    raw_links = re.findall(r'href="(https://economictimes\.indiatimes\.com/masterclass/[^"]+)"', html)
    seen = set()
    items = []

    for link in raw_links:
        if "photo/" in link or link in seen:
            continue
        seen.add(link)
        items.append({
            "title": slug_to_title(unescape(link)),
            "url": unescape(link)
        })
        if len(items) >= limit:
            break

    return items


def get_live_et_content(force_refresh=False):
    """Return cached ET content and refresh it when needed."""
    now = time.time()
    if not force_refresh and LIVE_DATA_CACHE["data"] and LIVE_DATA_CACHE["expires_at"] > now:
        return LIVE_DATA_CACHE["data"]

    live_data = {}
    try:
        live_data["markets"] = fetch_rss_items(ET_LIVE_SOURCES["markets_rss"])
    except Exception as exc:
        print(f"ET live markets fetch failed: {exc}")
        live_data["markets"] = []

    try:
        live_data["wealth"] = fetch_rss_items(ET_LIVE_SOURCES["wealth_rss"])
    except Exception as exc:
        print(f"ET live wealth fetch failed: {exc}")
        live_data["wealth"] = []

    try:
        live_data["masterclass"] = fetch_masterclass_items()
    except Exception as exc:
        print(f"ET live masterclass fetch failed: {exc}")
        live_data["masterclass"] = []

    live_data["refreshed_at"] = int(now)
    LIVE_DATA_CACHE["data"] = live_data
    LIVE_DATA_CACHE["expires_at"] = now + LIVE_DATA_TTL_SECONDS
    return live_data


def get_active_groq_model(force_refresh=False):
    """Resolve a currently active Groq model, preferring env override first."""
    env_model = os.getenv("GROQ_MODEL")
    if env_model:
        return env_model

    now = time.time()
    if not force_refresh and MODEL_CACHE["model"] and MODEL_CACHE["expires_at"] > now:
        return MODEL_CACHE["model"]

    resolved_model = "llama-3.1-8b-instant"

    if client is not None:
        try:
            models = client.models.list()
            available_ids = {model.id for model in models.data}
            for candidate in PREFERRED_GROQ_MODELS:
                if candidate in available_ids:
                    resolved_model = candidate
                    break
        except Exception as exc:
            print(f"Groq models list failed: {exc}")

    MODEL_CACHE["model"] = resolved_model
    MODEL_CACHE["expires_at"] = now + MODEL_CACHE_TTL_SECONDS
    return resolved_model


def format_live_action(prefix, item, description):
    return {
        "label": prefix,
        "headline": item["title"],
        "url": item["url"],
        "description": description,
        "live": True
    }


def get_mode_configuration(mode, simplify_level):
    if mode == "summarize":
        return {
            "label": "Summarize Mode",
            "instructions": "Summarize the pasted article or page content with clear sections: Title, Overview, Key Takeaways, Insights, and Why It Matters. Start from the beginning of the source and preserve source order."
        }
    if mode == "research":
        return {
            "label": "Research Mode",
            "instructions": "Provide a structured report with a title, overview, key points, insights, and a concise conclusion. Use markdown headings and bullet points."
        }
    if mode == "simplify":
        depth_map = {
            "basic": "Explain in very simple beginner language using short sentences.",
            "medium": "Explain clearly with moderate detail and practical examples.",
            "advanced": "Explain with deeper detail, clearer terminology, and richer examples while staying accessible."
        }
        return {
            "label": f"Simplify Mode ({simplify_level.title()})",
            "instructions": f"{depth_map.get(simplify_level, depth_map['basic'])} Structure the answer as: Definition, Why it is useful, Steps, Example, and Tips."
        }
    if mode == "alerts":
        return {
            "label": "Alerts Mode",
            "instructions": "Generate 3 to 5 realistic financial alerts in short lines."
        }
    if mode == "highlights":
        return {
            "label": "Highlights Mode",
            "instructions": "Generate 3 to 5 daily financial or news highlights and include the date."
        }
    return {
        "label": "Chat Mode",
        "instructions": "Answer the user's exact request directly like a helpful assistant. Do not force a recommendation list if the question does not need one. Be conversational, specific, and useful first. Add ET suggestions only when they genuinely help as a next step."
    }


def build_alert_items(profile, section):
    section_title = section.title()
    goal = profile.get("goal", "Learn")
    return [
        {
            "title": f"{section_title} momentum building",
            "description": f"Signals linked to your {goal.lower()} goal are showing stronger activity today."
        },
        {
            "title": "Volatility watch active",
            "description": "Short-term market swings are increasing, so decision timing matters more than usual."
        },
        {
            "title": "ET insight worth checking",
            "description": "A fresh ET recommendation path is available that aligns with your current dashboard focus."
        },
        {
            "title": "Risk profile reminder",
            "description": f"Your {profile.get('risk', 'Medium').lower()} risk preference suggests keeping actions measured and consistent."
        }
    ]


def build_highlight_items(section, current_date):
    section_title = section.title()
    return [
        {
            "title": f"{current_date}: Top {section_title} update",
            "description": f"A key {section} development is shaping what users may want to explore next."
        },
        {
            "title": f"{current_date}: ET ecosystem signal",
            "description": "Economic Times coverage is surfacing new context that can inform the next step."
        },
        {
            "title": f"{current_date}: Opportunity watch",
            "description": "Current trends suggest a useful moment to review insights, learn, or act carefully."
        },
        {
            "title": f"{current_date}: Smart follow-up",
            "description": "Use this dashboard as a guide to decide whether you should learn more, track updates, or take action."
        }
    ]


def message_title_from_section(section):
    mapping = {
        "investment": "Investment research brief",
        "news": "News and trends research brief",
        "learning": "Learning roadmap research brief",
    }
    return mapping.get(section, "Financial research brief")


def prepare_summary_source_text(source_text, max_chars=9000):
    """Keep summarize mode focused on the start of pasted content and preserve source order."""
    if not source_text:
        return ""

    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in source_text.splitlines()
        if line.strip()
    ]

    selected_lines = []
    total_chars = 0
    for line in lines:
        if total_chars + len(line) > max_chars:
            break
        selected_lines.append(line)
        total_chars += len(line) + 1

    prepared = "\n".join(selected_lines)
    return prepared[:max_chars]


def strip_html_to_text(html, max_chars=14000):
    """Convert fetched HTML into plain text suitable for deterministic summarization."""
    if not html:
        return ""

    if BeautifulSoup is not None:
        soup = BeautifulSoup(html, "html.parser")
        for node in soup(["script", "style", "noscript", "svg"]):
            node.decompose()
        text = soup.get_text("\n", strip=True)
        text = re.sub(r"\n{2,}", "\n", text)
        return text[:max_chars]

    cleaned = re.sub(r"(?is)<script\b[^>]*>.*?</script>", " ", html)
    cleaned = re.sub(r"(?is)<style\b[^>]*>.*?</style>", " ", cleaned)
    cleaned = re.sub(r"(?is)<noscript\b[^>]*>.*?</noscript>", " ", cleaned)
    cleaned = re.sub(r"(?is)<svg\b[^>]*>.*?</svg>", " ", cleaned)
    cleaned = re.sub(r"(?i)<br\s*/?>", "\n", cleaned)
    cleaned = re.sub(r"(?i)</(p|div|section|article|h1|h2|h3|h4|h5|h6|li|ul|ol|tr|table|blockquote)>", "\n", cleaned)
    cleaned = re.sub(r"(?s)<[^>]+>", " ", cleaned)
    cleaned = unescape(cleaned)

    lines = []
    for raw_line in cleaned.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if len(line) < 3:
            continue
        lines.append(line)
        if sum(len(item) for item in lines) >= max_chars:
            break

    return "\n".join(lines)[:max_chars]


def fetch_summary_source_from_url(source_link):
    """Fetch article/page text from a URL so summarize mode can work from links directly."""
    if not source_link:
        return ""

    parsed = urlparse(source_link.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ET-AI-Concierge/1.0; +https://economictimes.indiatimes.com/)"
    }

    try:
        response = httpx.get(source_link, timeout=12, follow_redirects=True, headers=headers)
        response.raise_for_status()
    except Exception as exc:
        print(f"URL fetch failed for summarize mode: {exc}")
        return ""

    html = response.text
    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    title = re.sub(r"\s+", " ", unescape(title_match.group(1))).strip() if title_match else ""
    text = strip_html_to_text(html)
    if not text:
        return ""

    parts = [f"Source URL: {response.url}"]
    if title:
        parts.append(f"Page Title: {title}")
    parts.append("")
    parts.append(text)
    return "\n".join(parts).strip()


def extract_meaningful_summary_lines(source_text, max_lines=18):
    """Remove obvious navigation noise and preserve the earliest meaningful content lines."""
    prepared = prepare_summary_source_text(source_text)
    if not prepared:
        return []

    noise_patterns = [
        r"^the economic times$",
        r"^english edition",
        r"^home$",
        r"^sign in$",
        r"^my watchlist$",
        r"^today'?s epaper$",
        r"^load more\.?$",
        r"^more$",
        r"^browse$",
        r"^hot on web$",
        r"^latest news$",
        r"^top searched companies$",
        r"^top calculators$",
        r"^top commodities$",
        r"^other useful links$",
        r"^copyright",
    ]

    lines = []
    for raw_line in prepared.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        if any(re.search(pattern, line, re.IGNORECASE) for pattern in noise_patterns):
            continue
        if len(line) < 3:
            continue
        lines.append(line)
        if len(lines) >= max_lines:
            break

    return lines


def build_ordered_summary_response(source_text, personality):
    """Create a deterministic summary that always starts from the beginning of pasted content."""
    lines = extract_meaningful_summary_lines(source_text)
    if not lines:
        return (
            f"Personality: {personality}\n\n"
            "I could not find enough meaningful content to summarize.\n\n"
            "1. Paste the article or page text directly into the box.\n"
            "2. Make sure the top of the content is included.\n"
            "3. Then run summarize again for a cleaner result.\n\n"
            "This works best when the pasted content includes the first visible title or section."
        )

    searched_for = ""
    content_lines = []
    skip_next = False
    for index, line in enumerate(lines):
        if skip_next:
            skip_next = False
            continue
        if line.upper() == "SEARCHED FOR:" and index + 1 < len(lines):
            searched_for = lines[index + 1]
            skip_next = True
            continue
        content_lines.append(line)

    if not content_lines:
        content_lines = lines[:]

    opening = content_lines[0]
    overview = f"This page begins with: {opening}"
    if searched_for:
        overview = f"This page starts with ET results for {searched_for}, and the first visible focus is: {opening}"

    key_points = []
    seen = set()
    for line in content_lines[1:10]:
        normalized = line.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        if len(line) < 25:
            continue
        key_points.append(line)
        if len(key_points) >= 4:
            break

    if not key_points:
        key_points = content_lines[1:5]

    companies = re.findall(r"\b(?:Tata|Reliance|HDFC|Axis|SBI|Suzlon|IRFC|IREDA|TCS|Infosys|Wipro|Paytm|Yes Bank|PNB)\b", " ".join(content_lines), re.IGNORECASE)
    unique_companies = []
    for company in companies:
        title_case = company.title()
        if title_case not in unique_companies:
            unique_companies.append(title_case)
        if len(unique_companies) >= 4:
            break

    response_lines = [
        f"Personality: {personality}",
        "",
        f"Overview: {overview}",
        "",
        "Key Takeaways:",
    ]

    for index, point in enumerate(key_points, start=1):
        response_lines.append(f"{index}. {point}")

    response_lines.append("")
    response_lines.append("Insights:")
    if unique_companies:
        response_lines.append(f"The early part of the page mentions companies or stocks like {', '.join(unique_companies)}.")
    else:
        response_lines.append("The first visible section sets the main context, so the top of the page matters most here.")

    response_lines.append("")
    response_lines.append("Why It Matters To You:")
    response_lines.append(f"This summary follows the page from the top so you see the first important items before the later sections, which makes it easier for a {personality.lower()} to decide what to explore next.")
    return "\n".join(response_lines)


def extract_topic_from_message(message, section):
    """Extract a likely stock or topic from the current user query."""
    message = (message or "").strip()
    if not message:
        return ""

    cleaned = re.sub(r"[^A-Za-z0-9\s&.-]", " ", message)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    lowered = cleaned.lower()

    generic_terms = {
        "stock", "stocks", "share", "shares", "price", "news", "learn", "investment",
        "invest", "investing", "about", "for", "please", "tell", "me", "latest",
        "today", "research", "explain", "analysis", "market", "markets"
    }

    def clean_candidate(candidate):
        tokens = [
            token for token in re.split(r"\s+", candidate.strip())
            if token and token.lower() not in generic_terms
        ]
        return " ".join(tokens[:4]).title()

    if section == "investment":
        patterns = [
            r"(?:about|on|for)\s+([A-Za-z0-9&.\-\s]{2,40})",
            r"([A-Za-z0-9&.\-\s]{2,40})\s+(?:stock|stocks|share|shares|price)",
        ]
        for pattern in patterns:
            match = re.search(pattern, cleaned, re.IGNORECASE)
            if match:
                candidate = clean_candidate(match.group(1).strip(" .-"))
                if candidate:
                    return candidate

    tokens = [token for token in lowered.split() if token not in generic_terms]
    if not tokens:
        return ""

    return " ".join(tokens[:4]).title()


def build_topic_search_action(topic, section):
    """Build an ET search action for a specific stock or topic."""
    if not topic:
        return None

    encoded_topic = topic.replace(" ", "+")
    return {
        "label": f"Search ET for {topic}",
        "headline": f"{topic} on Economic Times",
        "url": f"https://economictimes.indiatimes.com/topic/{encoded_topic}",
        "description": f"Open ET topic coverage focused on {topic}.",
        "live": True
    }


def build_offering_action(offering_key, description, headline="ET ecosystem path"):
    offering = ET_OFFERINGS.get(offering_key)
    if not offering:
        return None
    return {
        "label": offering["title"],
        "headline": headline,
        "url": offering["url"],
        "description": description,
        "live": False
    }


def get_relevant_offering_keys(message, section, mode, topic=""):
    text = " ".join(filter(None, [message, topic, section, mode])).lower()
    matched_keys = []

    keyword_groups = [
        (["prime", "insight", "analysis", "deep dive"], "prime"),
        (["market", "stock", "stocks", "share", "shares", "sip", "mutual fund", "etf"], "markets"),
        (["mutual fund", "funds", "mf"], "mf"),
        (["wealth", "retirement", "tax", "personal finance"], "wealth"),
        (["masterclass", "course", "learn", "learning", "basics", "workshop"], "masterclass"),
        (["webinar", "webinars"], "webinars"),
        (["event", "events", "summit", "conference"], "events"),
        (["wealth summit", "summits"], "wealth_summits"),
        (["loan", "loans", "borrow", "emi", "home loan", "personal loan"], "loans"),
        (["insurance", "health insurance", "life insurance", "cover"], "insurance"),
        (["credit card", "card", "cards"], "cards"),
        (["wealth management", "portfolio", "advisory"], "wealth_management"),
        (["service", "services", "partner", "partnership"], "services"),
        (["news", "headlines", "update", "updates"], "news"),
    ]

    for keywords, offering_key in keyword_groups:
        if any(keyword in text for keyword in keywords):
            matched_keys.append(offering_key)

    default_keys_by_section = {
        "investment": ["markets", "prime", "wealth", "mf", "wealth_management", "services"],
        "learning": ["masterclass", "webinars", "prime", "events", "wealth_summits"],
        "news": ["news", "prime", "markets", "events", "services"],
    }

    for offering_key in default_keys_by_section.get(section, ["news", "prime", "markets"]):
        if offering_key not in matched_keys:
            matched_keys.append(offering_key)

    return matched_keys


def build_report_pdf(title, report_date, content):
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 50

    pdf.setTitle(title)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(50, y, title)
    y -= 24

    pdf.setFont("Helvetica", 10)
    pdf.drawString(50, y, f"Date: {report_date}")
    y -= 28

    pdf.setFont("Helvetica", 11)
    for raw_line in content.splitlines():
        line = raw_line.strip() or " "
        words = line.split()
        current = ""

        if not words:
            y -= 14
        else:
            for word in words:
                candidate = f"{current} {word}".strip()
                if pdf.stringWidth(candidate, "Helvetica", 11) > (width - 100):
                    pdf.drawString(50, y, current)
                    y -= 16
                    current = word
                else:
                    current = candidate
            if current:
                pdf.drawString(50, y, current)
                y -= 16

        if y < 60:
            pdf.showPage()
            pdf.setFont("Helvetica", 11)
            y = height - 50

    pdf.save()
    buffer.seek(0)
    return buffer


def build_et_actions(profile, section, topic=""):
    """Return ET actions from live data first, then fall back to stable section links."""
    live_data = get_live_et_content()
    actions = []
    section = (section or "investment").lower()
    topic_action = build_topic_search_action(topic, section)
    relevant_offering_keys = get_relevant_offering_keys(topic, section, "chat", topic)

    if topic_action:
        actions.append(topic_action)

    if section == 'investment':
        if live_data.get("markets"):
            actions.append(format_live_action(
                "Latest on ET Markets",
                live_data["markets"][0],
                "Open the newest ET Markets story linked to your investing intent."
            ))
        if live_data.get("masterclass"):
            actions.append(format_live_action(
                "Current ET Masterclass",
                live_data["masterclass"][0],
                "Go to a currently listed ET learning session for investors."
            ))
        if live_data.get("wealth"):
            actions.append(format_live_action(
                "Latest on ET Wealth",
                live_data["wealth"][0],
                "See a fresh ET Wealth article that can support your next decision."
            ))

    elif section == 'learning':
        if live_data.get("masterclass"):
            actions.append(format_live_action(
                "Current ET Masterclass",
                live_data["masterclass"][0],
                "Start from a currently listed ET class or workshop."
            ))
        if live_data.get("wealth"):
            actions.append(format_live_action(
                "Latest on ET Wealth",
                live_data["wealth"][0],
                "Read a recent ET Wealth piece to strengthen your basics."
            ))
        if live_data.get("markets"):
            actions.append(format_live_action(
                "Latest on ET Markets",
                live_data["markets"][0],
                "Use a current markets story as a practical learning anchor."
            ))

    else:
        if live_data.get("markets"):
            actions.append(format_live_action(
                "Latest Market Trend",
                live_data["markets"][0],
                "See a current ET market update connected to the latest news cycle."
            ))
        if live_data.get("wealth"):
            actions.append(format_live_action(
                "Latest on Economic Times",
                live_data["wealth"][0],
                "Open a timely ET finance and wealth story for context."
            ))
        if live_data.get("masterclass"):
            actions.append(format_live_action(
                "Featured ET Learning",
                live_data["masterclass"][0],
                "Jump from the news into a current ET learning experience."
            ))

    for offering_key in relevant_offering_keys:
        ecosystem_action = build_offering_action(
            offering_key,
            f"Open the {ET_OFFERINGS[offering_key]['title']} route in the ET ecosystem.",
            "ET ecosystem path"
        )
        if ecosystem_action:
            actions.append(ecosystem_action)

    if len(actions) < 5:
        fallback_actions = []
        for offering_key in relevant_offering_keys:
            fallback_action = build_offering_action(
                offering_key,
                f"Open the {ET_OFFERINGS[offering_key]['title']} path inside the broader ET ecosystem.",
                "ET ecosystem path"
            )
            if fallback_action:
                fallback_actions.append(fallback_action)

        for item in fallback_actions:
            if len(actions) >= 6:
                break
            actions.append(item)

    deduped_actions = []
    seen_urls = set()
    for action in actions:
        url = action.get("url")
        if url and url not in seen_urls:
            seen_urls.add(url)
            deduped_actions.append(action)
        if len(deduped_actions) >= 6:
            break

    return deduped_actions[:6]


def format_conversation_history(history, max_items=10):
    """Format recent turns so follow-up questions can use prior context."""
    if not history:
        return "No prior conversation."

    lines = []
    for item in history[-max_items:]:
        role = str(item.get("role") or "user").strip().lower()
        label = "Assistant" if role == "assistant" else "User"
        mode = str(item.get("mode") or "").strip()
        content = re.sub(r"\s+", " ", str(item.get("content") or "").strip())
        if not content:
            continue
        lines.append(f"{label}{f' ({mode})' if mode else ''}: {content}")

    return "\n".join(lines) if lines else "No prior conversation."


def response_agent(message, profile, personality, decision, section, mode, simplify_level, current_date, topic="", source_text="", conversation_history=None, language="english"):
    """
    Generate AI response using Groq with structured prompt.
    Returns tuple: (reply, source)
    source is 'groq' or 'fallback'.
    """
    if mode == "summarize":
        return build_ordered_summary_response(source_text, personality), "local_summary"

    et_actions = build_et_actions(profile, section, topic)
    action_context = "\n".join([
        f"- {item['label']}: {item.get('headline', item['label'])} -> {item['url']} ({item['description']})"
        for item in et_actions
    ])

    mode_config = get_mode_configuration(mode, simplify_level)
    history_context = format_conversation_history(conversation_history)

    primary_input = prepare_summary_source_text(source_text) if mode == "summarize" and source_text.strip() else message

    missing_areas = "; ".join(get_missing_areas(profile))

    prompt = f"""You are an AI Concierge for the Economic Times ecosystem.

User Profile:
* Type: {profile['user_type']}
* Goal: {profile['goal']}
* Risk: {profile['risk']}
* Experience: {get_experience_level(profile)}
* Personality: {personality}
* Missing Areas: {missing_areas}
* Section: {section}
* Mode: {mode}
* Language: {language.title()}
* Date: {current_date}
* Topic: {topic or 'General section query'}

Recent Conversation:
{history_context}

Instructions:
1. Adapt response based on mode:
   * chat -> respond like ChatGPT: understand the exact ask, use prior conversation when relevant, answer it directly, and only then suggest helpful next steps
   * research -> structured analysis
   * simplify -> adjust depth
   * alerts -> generate alerts
   * highlights -> generate news
   * summarize -> summarize the pasted article/page content
2. Always:
   * be accurate, relevant, and tailored to the user's request
   * if you are not sure about a fact, say what is uncertain instead of inventing an answer
   * do not make up live prices, dates, returns, headlines, or company-specific facts
   * behave like a financial concierge, not just a tool
   * guide the user toward the next best action so they never wonder what to do next
   * treat recent conversation as active context for follow-up questions unless the user clearly changes topic
   * keep the answer specific if the user names a stock, company, concept, or news topic
   * explain reasoning in plain language when useful
   * keep the writing clean, well-structured, and free of filler
   * respond fully in {language.title()}
   * if a stock or company topic is mentioned, stay specific to that stock instead of answering generically
   * if mode is summarize, ignore dashboard bias and summarize whatever appears in the pasted content, including mixed news, stocks, search results, and companies
   * if mode is summarize, follow source order and begin with the first important item on the pasted page
3. ET ecosystem behavior:
   * for chat mode, mention ET resources only if they naturally help as a next step
   * for research, simplify, alerts, and highlights, include relevant ET ecosystem references when useful
   * do not force ET references into every paragraph
4. Keep:
   * clear
   * beginner-friendly when appropriate
   * well structured for the selected mode
5. Mode guidance: {mode_config['instructions']}

Current Message: {message}
Primary Content To Use: {primary_input}

Available ET paths:
{action_context}

Output rules:
- In chat mode:
  Start with the direct answer to the user's exact request.
  If the user asks for explanation, give it.
  Include a short 'What should you do next?' style finish with 2 or 3 concise next steps.
  End with a short helpful closing line.
- In research mode:
  Use clear headings, key points, insights, and a short conclusion.
- In simplify mode:
  Adjust the depth based on simplify level.
- In alerts or highlights mode:
  Return short, scannable items.
- In summarize mode:
  Include Overview, Key Takeaways, Insights, and Why It Matters To You.

Do not sound robotic. Do not repeat the profile unless it helps answer the request. Keep it simple, natural, and useful."""

    model_name = get_active_groq_model()

    if client is None:
        return build_fallback_response(profile, section, personality, mode, simplify_level, current_date, source_text), 'fallback'

    try:
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            temperature=0.2,
        )
        return chat_completion.choices[0].message.content, 'groq'

    except Exception as e:
        print(f"Groq API Error: {e}")
        if "decommissioned" in str(e).lower() or "no longer supported" in str(e).lower():
            try:
                refreshed_model = get_active_groq_model(force_refresh=True)
                chat_completion = client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=refreshed_model,
                    temperature=0.2,
                )
                return chat_completion.choices[0].message.content, 'groq'
            except Exception as retry_error:
                print(f"Groq retry failed: {retry_error}")
        return build_fallback_response(profile, section, personality, mode, simplify_level, current_date, source_text), 'fallback'

def build_fallback_response(profile, section, personality, mode, simplify_level, current_date, source_text=""):
    """Return a deterministic response when the Groq SDK or API is unavailable."""
    if mode == "summarize":
        excerpt = prepare_summary_source_text(source_text)
        excerpt = re.sub(r"\s+", " ", excerpt)
        preview = excerpt[:220] + ("..." if len(excerpt) > 220 else "")
        return (
            f"Personality: {personality}\n\n"
            "Summary Overview\n"
            "This pasted ET page should be read from the top, because it mixes search results, stock signals, and general news in one long stream.\n\n"
            "1. Start with the first visible stories or search results because they usually represent the primary page focus.\n"
            "2. Separate stock-related items, news headlines, and search/trending sections instead of treating the whole page as one article.\n"
            "3. If stocks or companies are mentioned, identify them as specific entities rather than blending them into generic news.\n"
            "4. Use the page structure to understand what matters first, then move to later supporting items.\n\n"
            f"Why It Matters\nThis helps because a long ET page can be noisy, and summarizing it makes the important financial signals easier to spot.\n\n"
            f"Source Snapshot\n{preview}"
        )
    if mode == "research":
        return (
            f"Personality: {personality}\n\n"
            f"Research Topic: {message_title_from_section(section)}\n\n"
            "Key Points\n"
            "- Understand the basics before acting\n"
            "- Compare current ET ecosystem resources for context\n"
            "- Build decisions around goal, risk, and time horizon\n\n"
            "Summary\n"
            "Use ET Markets, ET Prime, Economic Times, and ET Masterclass as supporting resources for deeper understanding."
        )
    if mode == "simplify":
        if simplify_level == "basic":
            return (
                f"Personality: {personality}\n\n"
                "Think of this as choosing the easiest next step for your money journey.\n\n"
                "1. Start with one simple action in this dashboard\n"
                "2. Use ET recommendations to learn before acting\n"
                "3. Keep decisions aligned with your risk comfort\n\n"
                "This works because simple progress is easier to sustain."
            )
        if simplify_level == "medium":
            return (
                f"Personality: {personality}\n\n"
                "Definition\nThis topic becomes easier when you separate the core idea from the jargon.\n\n"
                "Why It Is Useful\nIt helps you connect a financial concept to a real action or decision.\n\n"
                "Steps\n1. Understand the idea\n2. Connect it to a practical use\n3. Apply it inside this dashboard\n\n"
                "Example\nUse one company, market move, or finance concept as a working example.\n\n"
                "Tips\nAsk follow-up questions until the idea feels natural."
            )
        return (
            f"Personality: {personality}\n\n"
            "A deeper explanation helps you connect your profile, the current section, and the right ET tools.\n\n"
            "1. Match your financial goal with the dashboard focus\n"
            "2. Use ET resources to compare options and build conviction\n"
            "3. Review risk before turning insight into action\n\n"
            "This works because detail improves confidence without removing structure."
        )
    if mode == "alerts":
        alerts = build_alert_items(profile, section)
        lines = [f"Personality: {personality}", "", f"Alerts for {current_date}"]
        for index, item in enumerate(alerts, start=1):
            lines.append(f"{index}. {item['title']}: {item['description']}")
        lines.extend(["", "These alerts fit because they align with your profile and dashboard focus."])
        return "\n".join(lines)
    if mode == "highlights":
        highlights = build_highlight_items(section, current_date)
        lines = [f"Personality: {personality}", "", f"Highlights for {current_date}"]
        for index, item in enumerate(highlights, start=1):
            lines.append(f"{index}. {item['title']}: {item['description']}")
        lines.extend(["", "These highlights fit because they give you a quick ET-style briefing before you go deeper."])
        return "\n".join(lines)

    if section == 'investment':
        fallback_text = (
            "I can help with investing questions directly.\n\n"
            "Tell me the exact thing you want, like a stock, SIP, mutual fund, beginner plan, or risk comparison, and I will answer that specifically.\n\n"
            "If you want a next step after that, I can also point you to ET Markets, ET Wealth, or ET Prime."
        )
    elif section == 'learning':
        fallback_text = (
            "I can explain financial topics directly and simply.\n\n"
            "Ask me exactly what you want to learn, like what SIP means, how mutual funds work, or how to start investing as a student, and I will answer that clearly.\n\n"
            "If you want, I can also suggest ET Masterclass or ET explainers as the next step."
        )
    else:
        fallback_text = (
            "I can help you understand news directly.\n\n"
            "Ask about a headline, company, market move, or trend, and I will explain what happened, why it matters, and what to watch next.\n\n"
            "If useful, I can also point you to the right Economic Times section afterward."
        )
    return fallback_text

@app.route('/')
def home():
    return render_template('index.html')


@app.route('/login')
def login():
    return render_template('login.html')


@app.route('/signup')
def signup():
    return render_template('signup.html')


@app.route('/forgot-password')
def forgot_password():
    return render_template('forgot_password.html')


@app.route('/investment')
def investment():
    return render_template('investment.html')


@app.route('/news')
def news():
    return render_template('news.html')


@app.route('/learning')
def learning():
    return render_template('learning.html')


@app.route('/health', methods=['GET'])
def health():
    live_data = get_live_et_content()
    return jsonify({
        "status": "ok",
        "supabase_configured": bool(supabase_url and supabase_anon_key),
        "groq_sdk_installed": Groq is not None,
        "groq_configured": bool(groq_api_key),
        "groq_enabled": client is not None,
        "groq_model": get_active_groq_model(),
        "et_live_cache_ttl": LIVE_DATA_TTL_SECONDS,
        "et_live_refreshed_at": live_data.get("refreshed_at"),
        "et_live_counts": {
            "markets": len(live_data.get("markets", [])),
            "wealth": len(live_data.get("wealth", [])),
            "masterclass": len(live_data.get("masterclass", []))
        }
    })


@app.route('/report', methods=['POST'])
def report():
    data = request.get_json() or {}
    content = str(data.get("content") or "").strip()
    title = str(data.get("title") or "AI Financial Concierge Report").strip() or "AI Financial Concierge Report"
    report_date = str(data.get("date") or get_current_date_label()).strip()

    if not content:
        return jsonify({"error": "No content available to export."}), 400

    pdf_buffer = build_report_pdf(title, report_date, content)
    filename = re.sub(r"[^A-Za-z0-9_-]+", "_", title).strip("_") or "ai_financial_concierge_report"
    return send_file(
        pdf_buffer,
        as_attachment=True,
        download_name=f"{filename}.pdf",
        mimetype="application/pdf"
    )

@app.route('/chat', methods=['POST'])
def chat():
    # Get JSON data from the request
    data = request.get_json() or {}

    # Extract message and questionnaire profile
    message = data.get('message', '').strip()
    source_link = str(data.get("source_link") or "").strip()
    source_text = str(data.get("source_text") or "").strip()
    conversation_history = data.get("conversation_history") or []
    mode = normalize_mode(data.get("mode"))
    language = normalize_language(data.get("language"))
    profile = normalize_profile(data.get('profile', {}))
    section = str(data.get('section', 'investment')).strip().lower() or 'investment'
    personality = detect_personality(profile)
    simplify_level = normalize_simplify_level(data.get("simplify_level"))
    current_date = get_current_date_label()
    topic = extract_topic_from_message(message, section)

    if mode == "summarize" and source_link:
        fetched_text = fetch_summary_source_from_url(source_link)
        if fetched_text:
            source_text = f"{fetched_text}\n\n{source_text}".strip() if source_text else fetched_text

    if not message and not (mode == "summarize" and (source_text or source_link)):
        return jsonify({
            "reply": "Please enter a message.",
            "profile": profile,
            "personality": personality,
            "section": section,
            "mode": mode,
            "simplify_level": simplify_level,
            "date": current_date,
            "topic": topic,
            "categories": [],
            "actions": [],
            "cards": []
        })

    if mode == "summarize" and not source_text:
        return jsonify({
            "reply": "I could not read that link yet. Paste the article text or try another public URL.",
            "profile": profile,
            "personality": personality,
            "section": section,
            "mode": mode,
            "simplify_level": simplify_level,
            "date": current_date,
            "topic": topic,
            "categories": [],
            "actions": [],
            "cards": []
        })

    try:
        decision = decision_agent(profile, section)
        reply, source = response_agent(
            message,
            profile,
            personality,
            decision,
            section,
            mode,
            simplify_level,
            current_date,
            topic,
            source_text,
            conversation_history,
            language
        )

        actions = build_et_actions(profile, section, topic)
        cards = []
        if mode == "alerts":
            cards = build_alert_items(profile, section)
        elif mode == "highlights":
            cards = build_highlight_items(section, current_date)

        return jsonify({
            "reply": reply,
            "source": source,
            "profile": profile,
            "personality": personality,
            "section": section,
            "mode": mode,
            "simplify_level": simplify_level,
            "date": current_date,
            "topic": topic,
            "categories": decision['categories'],
            "actions": actions,
            "cards": cards
        })

    except Exception as e:
        print(f"Error in chat processing: {e}")
        return jsonify({
            "reply": "Sorry, I'm having trouble processing your request right now.",
            "profile": profile,
            "personality": personality,
            "section": section,
            "mode": mode,
            "simplify_level": simplify_level,
            "date": current_date,
            "topic": topic,
            "categories": [],
            "actions": [],
            "cards": []
        }), 500


@app.context_processor
def inject_public_config():
    return {
        "SUPABASE_URL": supabase_url,
        "SUPABASE_ANON_KEY": supabase_anon_key,
    }


if __name__ == '__main__':
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "true").strip().lower() == "true"
    app.run(host='0.0.0.0', port=port, debug=debug)
