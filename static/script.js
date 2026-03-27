const pageType = document.body.dataset.page;
const section = document.body.dataset.section || "";
const storageKey = "ai_financial_concierge_profile";
const settingsKey = "ai_financial_concierge_settings";
const conversationKeyPrefix = "ai_financial_concierge_conversation";

const defaultProfile = {
    first_name: "",
    last_name: "",
    profile_completed: false,
    user_type: "Student",
    goal: "Learn about finance",
    risk: "Medium",
    income: "",
    level: "",
    interests: "",
    name: "",
    age: ""
};

const defaultSettings = {
    display_name: "ET User",
    default_mode: "chat",
    default_simplify_level: "basic",
    language: "english"
};

function detectPersonality(profile) {
    const risk = (profile.risk || "").toLowerCase();
    if (risk === "low") {
        return "Risk-Averse Planner";
    }
    if (risk === "medium") {
        return "Balanced Learner";
    }
    if (risk === "high") {
        return "Aggressive Explorer";
    }
    return "Beginner Saver";
}

function loadProfile() {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return { ...defaultProfile };
        }
        return { ...defaultProfile, ...JSON.parse(raw) };
    } catch (error) {
        return { ...defaultProfile };
    }
}

function saveProfile(profile) {
    localStorage.setItem(storageKey, JSON.stringify(profile));
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(settingsKey);
        if (!raw) {
            return { ...defaultSettings };
        }
        return { ...defaultSettings, ...JSON.parse(raw) };
    } catch (error) {
        return { ...defaultSettings };
    }
}

function saveSettings(settings) {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function getConversationKey(sectionName, modeName) {
    return `${conversationKeyPrefix}_${sectionName || "default"}_${modeName || "chat"}`;
}

function loadConversationHistory(sectionName, modeName) {
    try {
        const raw = localStorage.getItem(getConversationKey(sectionName, modeName));
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        return [];
    }
}

function saveConversationHistory(sectionName, modeName, messages) {
    localStorage.setItem(getConversationKey(sectionName, modeName), JSON.stringify(messages));
}

function createHistoryId() {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDisplayInitials(name) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) {
        return "ET";
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function getProfileDisplayName(profile) {
    const firstName = String(profile?.first_name || "").trim();
    const lastName = String(profile?.last_name || "").trim();
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || String(profile?.name || "").trim();
}

function getPreferredDisplayName(profile, settings) {
    const profileName = getProfileDisplayName(profile);
    return profileName || settings.display_name || "ET User";
}

function initHomePage() {
    const flow = document.getElementById("questionnaire-flow");
    const progressRow = document.getElementById("questionnaire-progress");
    const progressCopy = document.getElementById("progress-copy");
    const progressFill = document.getElementById("progress-fill");
    const retakeButton = document.getElementById("retake-questionnaire");
    const destinationCard = document.getElementById("recommended-destination");
    const investmentCopy = document.getElementById("dashboard-copy-investment");
    const newsCopy = document.getElementById("dashboard-copy-news");
    const learningCopy = document.getElementById("dashboard-copy-learning");
    const savedProfile = loadProfile();
    const state = { ...defaultProfile, ...savedProfile };

    const baseQuestions = [
        {
            id: "full_name",
            title: "What should your AI call you?",
            type: "name"
        },
        {
            id: "user_type",
            title: "Which of these best describes you?",
            type: "options",
            options: ["Student", "Working Professional", "Investor", "Other"],
            otherPlaceholder: "Tell us how you would describe yourself"
        },
        {
            id: "goal",
            title: "What do you want to do right now?",
            type: "options",
            options: ["Learn about finance", "Start investing", "Save money", "Track market trends", "Other"],
            otherPlaceholder: "Tell us what you want to do"
        }
    ];

    function goalType(profile) {
        const goal = (profile.goal || "").toLowerCase();
        if (goal.includes("invest") || goal.includes("save")) {
            return "investment";
        }
        if (goal.includes("track") || goal.includes("news") || goal.includes("trend")) {
            return "news";
        }
        return "learning";
    }

    function getDynamicQuestions(profile) {
        const type = goalType(profile);
        if (type === "investment") {
            return [
                {
                    id: "risk",
                    title: "Which of these sounds most like you?",
                    type: "options",
                    options: [
                        { label: "I prefer safe and stable options", value: "Low" },
                        { label: "I balance safety and growth", value: "Medium" },
                        { label: "I aim for high returns even with risk", value: "High" }
                    ]
                },
                {
                    id: "income",
                    title: "What is your monthly income range?",
                    type: "options",
                    options: [
                        "Less than Rs 20,000",
                        "Rs 20,000 - Rs 50,000",
                        "Rs 50,000 - Rs 1,00,000",
                        "Above Rs 1,00,000",
                        "Prefer not to say"
                    ]
                }
            ];
        }
        if (type === "news") {
            return [
                {
                    id: "interests",
                    title: "What topics are you interested in?",
                    type: "options",
                    options: ["Stock Market", "Business & Economy", "Startups", "Personal Finance", "Other"],
                    otherPlaceholder: "Tell us the topic you want to follow"
                }
            ];
        }
        return [
            {
                id: "level",
                title: "What is your current level?",
                type: "options",
                options: ["Beginner", "Intermediate", "Advanced"]
            }
        ];
    }

    function getQuestions(profile) {
        return [
            ...baseQuestions,
            ...getDynamicQuestions(profile),
            {
                id: "optional_info",
                title: "Tell us a bit more (optional)",
                type: "optional"
            }
        ];
    }

    function getDestination(profile) {
        const type = goalType(profile);
        if (type === "investment") {
            return "/investment";
        }
        if (type === "news") {
            return "/news";
        }
        return "/learning";
    }

    function getDestinationTitle(profile) {
        const path = getDestination(profile);
        if (path === "/investment") {
            return "Investment";
        }
        if (path === "/news") {
            return "News";
        }
        return "Learning";
    }

    function showDashboardOptions() {
        const recommended = getDestinationTitle(state);
        flow.innerHTML = "";
        progressRow.classList.add("hidden");
        destinationCard.classList.remove("hidden");
        investmentCopy.textContent = recommended === "Investment"
            ? "Recommended for you right now, but always open whenever you want it."
            : "Explore investing ideas, SIPs, funds, and market opportunities.";
        newsCopy.textContent = recommended === "News"
            ? "Recommended for you right now, but always open whenever you want it."
            : "Track business updates, market moves, and what matters right now.";
        learningCopy.textContent = recommended === "Learning"
            ? "Recommended for you right now, but always open whenever you want it."
            : "Build confidence with explainers, concepts, and guided learning paths.";
    }

    function normalizeAnswer(questionId, value) {
        if (questionId === "user_type" && value === "Other") {
            return "Other";
        }
        if (questionId === "goal" && value === "Other") {
            return "Other";
        }
        if (questionId === "interests" && value === "Other") {
            return "Other";
        }
        return value;
    }

    function renderOptions(question, totalSteps, stepIndex) {
        flow.innerHTML = "";
        const card = document.createElement("div");
        card.className = "question-card";

        const title = document.createElement("h3");
        title.className = "question-title";
        title.textContent = question.title;
        card.appendChild(title);

        const optionsWrap = document.createElement("div");
        optionsWrap.className = "option-grid";

        const options = question.options || [];
        options.forEach(option => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "option-btn";
            const optionValue = typeof option === "string" ? option : option.value;
            const optionLabel = typeof option === "string" ? option : option.label;
            button.textContent = optionLabel;
            if ((state[question.id] || "") === optionValue || (state[question.id] || "") === optionLabel) {
                button.classList.add("active");
            }
            button.addEventListener("click", () => {
                state[question.id] = normalizeAnswer(question.id, optionValue);
                saveProfile(state);

                if (optionValue === "Other" && question.otherPlaceholder) {
                    renderOtherInput(question, totalSteps, stepIndex);
                    return;
                }
                renderStep(stepIndex + 1);
            });
            optionsWrap.appendChild(button);
        });

        card.appendChild(optionsWrap);
        flow.appendChild(card);
    }

    function renderNameInput(question, totalSteps, stepIndex) {
        flow.innerHTML = "";
        const card = document.createElement("div");
        card.className = "question-card";

        const title = document.createElement("h3");
        title.className = "question-title";
        title.textContent = question.title;
        card.appendChild(title);

        const copy = document.createElement("p");
        copy.className = "question-copy";
        copy.textContent = "Takes less than 60 seconds. Your AI will use this to personalize the experience.";
        card.appendChild(copy);

        const grid = document.createElement("div");
        grid.className = "form-grid";

        const firstNameField = document.createElement("label");
        firstNameField.className = "field";
        firstNameField.innerHTML = '<span>First Name</span><input type="text" id="question-first-name" class="question-input" placeholder="First name">';
        grid.appendChild(firstNameField);

        const lastNameField = document.createElement("label");
        lastNameField.className = "field";
        lastNameField.innerHTML = '<span>Last Name</span><input type="text" id="question-last-name" class="question-input" placeholder="Last name">';
        grid.appendChild(lastNameField);

        card.appendChild(grid);
        flow.appendChild(card);

        const firstNameInput = document.getElementById("question-first-name");
        const lastNameInput = document.getElementById("question-last-name");
        firstNameInput.value = state.first_name || "";
        lastNameInput.value = state.last_name || "";

        const actions = document.createElement("div");
        actions.className = "question-actions";

        const nextButton = document.createElement("button");
        nextButton.type = "button";
        nextButton.className = "primary-btn";
        nextButton.textContent = "Continue -> Personalize My Experience";
        nextButton.addEventListener("click", () => {
            const firstName = firstNameInput.value.trim();
            const lastName = lastNameInput.value.trim();
            if (!firstName) {
                firstNameInput.focus();
                return;
            }
            if (!lastName) {
                lastNameInput.focus();
                return;
            }
            state.first_name = firstName;
            state.last_name = lastName;
            state.name = `${firstName} ${lastName}`.trim();
            saveProfile(state);
            renderStep(stepIndex + 1);
        });
        actions.appendChild(nextButton);

        card.appendChild(actions);
    }

    function renderOtherInput(question, totalSteps, stepIndex) {
        flow.innerHTML = "";
        const card = document.createElement("div");
        card.className = "question-card";

        const title = document.createElement("h3");
        title.className = "question-title";
        title.textContent = question.title;
        card.appendChild(title);

        const field = document.createElement("label");
        field.className = "field";

        const span = document.createElement("span");
        span.textContent = "Tell us more";
        field.appendChild(span);

        const input = document.createElement("input");
        input.type = "text";
        input.className = "question-input";
        input.placeholder = question.otherPlaceholder;
        input.value = state[question.id] && state[question.id] !== "Other" ? state[question.id] : "";
        field.appendChild(input);
        card.appendChild(field);

        const actions = document.createElement("div");
        actions.className = "question-actions";

        const backButton = document.createElement("button");
        backButton.type = "button";
        backButton.className = "secondary-btn";
        backButton.textContent = "Back";
        backButton.addEventListener("click", () => renderStep(stepIndex));
        actions.appendChild(backButton);

        const nextButton = document.createElement("button");
        nextButton.type = "button";
        nextButton.className = "primary-btn";
        nextButton.textContent = "Continue";
        nextButton.addEventListener("click", () => {
            const value = input.value.trim();
            if (!value) {
                input.focus();
                return;
            }
            state[question.id] = value;
            saveProfile(state);
            renderStep(stepIndex + 1);
        });
        actions.appendChild(nextButton);

        card.appendChild(actions);
        flow.appendChild(card);
    }

    function renderOptional(question, totalSteps, stepIndex) {
        flow.innerHTML = "";
        const card = document.createElement("div");
        card.className = "question-card";

        const title = document.createElement("h3");
        title.className = "question-title";
        title.textContent = question.title;
        card.appendChild(title);

        const copy = document.createElement("p");
        copy.className = "question-copy";
        copy.textContent = "These are optional and help personalize the dashboard a bit more.";
        card.appendChild(copy);

        const grid = document.createElement("div");
        grid.className = "form-grid";

        const ageField = document.createElement("label");
        ageField.className = "field";
        ageField.innerHTML = '<span>Age</span><input type="number" id="optional-age" class="question-input" placeholder="Your age">';
        grid.appendChild(ageField);

        card.appendChild(grid);
        flow.appendChild(card);

        const ageInput = document.getElementById("optional-age");
        ageInput.value = state.age || "";

        const actions = document.createElement("div");
        actions.className = "question-actions";

        const skipButton = document.createElement("button");
        skipButton.type = "button";
        skipButton.className = "secondary-btn";
        skipButton.textContent = "Skip";
        skipButton.addEventListener("click", () => finishQuestionnaire());
        actions.appendChild(skipButton);

        const finishButton = document.createElement("button");
        finishButton.type = "button";
        finishButton.className = "primary-btn";
        finishButton.textContent = "Continue to Dashboard";
        finishButton.addEventListener("click", () => {
            state.age = ageInput.value.trim();
            saveProfile(state);
            finishQuestionnaire();
        });
        actions.appendChild(finishButton);

        card.appendChild(actions);
    }

    function updateProgress(stepIndex, totalSteps) {
        progressCopy.textContent = `Step ${Math.min(stepIndex + 1, totalSteps)} of ${totalSteps}`;
        progressFill.style.width = `${((stepIndex + 1) / totalSteps) * 100}%`;
    }

    function finishQuestionnaire() {
        state.profile_completed = true;
        saveProfile(state);
        const currentSettings = loadSettings();
        const profileDisplayName = getProfileDisplayName(state);
        if (profileDisplayName) {
            saveSettings({
                ...currentSettings,
                display_name: profileDisplayName
            });
        }
        showDashboardOptions();
    }

    function renderStep(stepIndex) {
        const questions = getQuestions(state);
        if (stepIndex >= questions.length) {
            finishQuestionnaire();
            return;
        }

        const question = questions[stepIndex];
        updateProgress(stepIndex, questions.length);

        if (question.type === "optional") {
            renderOptional(question, questions.length, stepIndex);
            return;
        }

        if (question.type === "name") {
            renderNameInput(question, questions.length, stepIndex);
            return;
        }

        renderOptions(question, questions.length, stepIndex);
    }

    retakeButton.addEventListener("click", () => {
        state.profile_completed = false;
        saveProfile(state);
        destinationCard.classList.add("hidden");
        progressRow.classList.remove("hidden");
        renderStep(0);
    });

    document.querySelectorAll("[data-dashboard-link]").forEach(link => {
        link.addEventListener("click", () => saveProfile(state));
    });

    if (state.profile_completed) {
        showDashboardOptions();
        return;
    }

    renderStep(0);
}

function parseResponseSections(text) {
    const lines = text
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    const sections = {
        intro: "",
        recommendations: [],
        closing: []
    };

    lines.forEach(line => {
        const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
        if (numberedMatch) {
            sections.recommendations.push(numberedMatch[1]);
        } else if (!sections.intro) {
            sections.intro = line;
        } else {
            sections.closing.push(line);
        }
    });

    return sections;
}

function createRecommendationCard(text, index) {
    const card = document.createElement("div");
    card.className = "recommendation-card";

    const step = document.createElement("div");
    step.className = "recommendation-step";
    step.textContent = `0${index + 1}`;
    card.appendChild(step);

    const body = document.createElement("div");
    body.className = "recommendation-body";

    const title = document.createElement("div");
    title.className = "recommendation-title";
    title.textContent = text.split(":")[0];
    body.appendChild(title);

    const description = document.createElement("div");
    description.className = "recommendation-description";
    description.textContent = text;
    body.appendChild(description);

    card.appendChild(body);
    return card;
}

function getCategoryLink(category, activeSection) {
    const normalized = (category || "").trim().toLowerCase();
    const sectionName = (activeSection || "").trim().toLowerCase();

    const directLinks = {
        "investment": "https://economictimes.indiatimes.com/markets",
        "et markets": "https://economictimes.indiatimes.com/markets",
        "et prime": "https://economictimes.indiatimes.com/prime",
        "et wealth": "https://economictimes.indiatimes.com/wealth",
        "partner services": "https://economictimes.indiatimes.com/wealth",
        "sip": "https://economictimes.indiatimes.com/wealth/invest/sip",
        "learning": "https://economictimes.indiatimes.com/webinars",
        "et masterclass": "https://economictimes.indiatimes.com/masterclass?utm_source=et_l1",
        "corporate events": "https://timesevents.com/",
        "wealth summits": "https://economictimes.indiatimes.com/topic/wealth+summit",
        "basics": "https://economictimes.indiatimes.com/wealth/invest",
        "news": "https://economictimes.indiatimes.com/news",
        "economic times": "https://economictimes.indiatimes.com/",
        "trends": "https://economictimes.indiatimes.com/markets"
    };

    if (directLinks[normalized]) {
        return directLinks[normalized];
    }

    if (sectionName === "investment") {
        return "https://economictimes.indiatimes.com/markets";
    }
    if (sectionName === "learning") {
        return "https://economictimes.indiatimes.com/masterclass?utm_source=et_l1";
    }
    return "https://economictimes.indiatimes.com/news";
}

function getSectionShortcutConfig(activeSection) {
    const configs = {
        investment: [
            { label: "Stocks", type: "prompt", value: "Help me explore stocks in an investment-focused way" },
            { label: "SIP", type: "prompt", value: "Explain SIP and help me get started from an investment dashboard perspective" },
            { label: "Trends", type: "prompt", value: "Show me investment trends that matter for my decisions right now" },
            { label: "ET Markets", type: "link", value: "https://economictimes.indiatimes.com/markets" },
            { label: "ET Prime", type: "link", value: "https://economictimes.indiatimes.com/prime" },
            { label: "ET Masterclass", type: "prompt", value: "Suggest ET Masterclass options that can improve my investment understanding" },
            { label: "ET Wealth", type: "link", value: "https://economictimes.indiatimes.com/wealth" },
            { label: "Mutual Funds", type: "prompt", value: "Help me understand mutual funds and where to begin for investing" },
            { label: "Corporate Events", type: "prompt", value: "Show how ET corporate events can help someone focused on investment opportunities" },
            { label: "Wealth Summits", type: "prompt", value: "Show how ET wealth summits can help with investment decisions" },
            { label: "Financial Services", type: "prompt", value: "Show ET financial services and partner options relevant to an investor" }
        ],
        news: [
            { label: "Stocks", type: "prompt", value: "Show me stock stories and stock-specific developments from a news perspective" },
            { label: "Trends", type: "prompt", value: "Show me the important market and finance trends today" },
            { label: "Updates", type: "prompt", value: "Give me the most important financial updates I should know" },
            { label: "Economic Times", type: "link", value: "https://economictimes.indiatimes.com/news" },
            { label: "ET Prime Insights", type: "link", value: "https://economictimes.indiatimes.com/prime" },
            { label: "ET Markets", type: "prompt", value: "Show how ET Markets connects to the latest news and market-moving stories" },
            { label: "ET Masterclass", type: "prompt", value: "Suggest ET Masterclass options that help explain the current news cycle" },
            { label: "Market Context", type: "prompt", value: "Explain the current market context in simple terms" },
            { label: "Corporate Events", type: "prompt", value: "Show ET corporate events that connect to the biggest business and market news themes" },
            { label: "Wealth Summits", type: "prompt", value: "Show wealth summit angles that are relevant to current news and personal finance" },
            { label: "Financial Services", type: "prompt", value: "Show ET financial services and partner options relevant to current financial news" }
        ],
        learning: [
            { label: "Basics", type: "prompt", value: "Teach me the basics of investing step by step" },
            { label: "Stocks", type: "prompt", value: "Teach me how stocks work in a beginner-friendly way" },
            { label: "Trends", type: "prompt", value: "Teach me how to understand market and finance trends as a learner" },
            { label: "ET Markets", type: "prompt", value: "Show how to use ET Markets as a learning tool" },
            { label: "ET Prime", type: "prompt", value: "Show how ET Prime can help me learn deeper financial concepts" },
            { label: "ET Masterclass", type: "link", value: "https://economictimes.indiatimes.com/masterclass?utm_source=et_l1" },
            { label: "Webinars", type: "link", value: "https://economictimes.indiatimes.com/webinars" },
            { label: "Explainers", type: "prompt", value: "Explain a finance topic in a simple beginner-friendly way" },
            { label: "Corporate Events", type: "prompt", value: "Show ET corporate events that are useful for learning about business and finance" },
            { label: "Wealth Summits", type: "link", value: "https://economictimes.indiatimes.com/topic/wealth+summit" },
            { label: "Financial Services", type: "prompt", value: "Explain ET financial services and partnerships in a beginner-friendly way" }
        ]
    };

    return configs[activeSection] || [];
}

function renderSummaryContent(container, text) {
    const lines = text
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    let overview = "";
    const takeawayItems = [];
    const closingItems = [];

    lines.forEach(line => {
        if (line.toLowerCase().startsWith("personality:")) {
            return;
        }
        if (!overview && !/^\d+\./.test(line) && !line.endsWith(":")) {
            overview = line;
            return;
        }
        if (/^\d+\.\s+/.test(line)) {
            takeawayItems.push(line.replace(/^\d+\.\s+/, ""));
            return;
        }
        if (!/^(summary overview|main content|why it matters|source snapshot)$/i.test(line.replace(/:$/, ""))) {
            closingItems.push(line);
        }
    });

    if (overview) {
        const hero = document.createElement("div");
        hero.className = "summary-hero";

        const label = document.createElement("div");
        label.className = "summary-label";
        label.textContent = "Quick Overview";
        hero.appendChild(label);

        const textNode = document.createElement("div");
        textNode.className = "summary-hero-text";
        textNode.textContent = overview;
        hero.appendChild(textNode);
        container.appendChild(hero);
    }

    if (takeawayItems.length) {
        const section = document.createElement("div");
        section.className = "summary-section";

        const title = document.createElement("div");
        title.className = "action-section-title";
        title.textContent = "Key Takeaways";
        section.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "summary-grid";

        takeawayItems.slice(0, 2).forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "summary-card";

            const badge = document.createElement("div");
            badge.className = "summary-card-badge";
            badge.textContent = `0${index + 1}`;
            card.appendChild(badge);

            const body = document.createElement("div");
            body.className = "summary-card-text";
            body.textContent = item;
            card.appendChild(body);

            grid.appendChild(card);
        });

        section.appendChild(grid);

        const remainingTakeaways = takeawayItems.slice(2);
        const remainingClosing = closingItems.slice(0);

        if (remainingTakeaways.length || remainingClosing.length) {
            const extraWrap = document.createElement("div");
            extraWrap.className = "summary-extra hidden";

            if (remainingTakeaways.length) {
                const moreGrid = document.createElement("div");
                moreGrid.className = "summary-grid";

                remainingTakeaways.forEach((item, index) => {
                    const card = document.createElement("div");
                    card.className = "summary-card";

                    const badge = document.createElement("div");
                    badge.className = "summary-card-badge";
                    badge.textContent = `0${index + 3}`;
                    card.appendChild(badge);

                    const body = document.createElement("div");
                    body.className = "summary-card-text";
                    body.textContent = item;
                    card.appendChild(body);

                    moreGrid.appendChild(card);
                });

                extraWrap.appendChild(moreGrid);
            }

            if (remainingClosing.length) {
                const footer = document.createElement("div");
                footer.className = "summary-footer";
                remainingClosing.forEach(item => {
                    const line = document.createElement("p");
                    line.textContent = item;
                    footer.appendChild(line);
                });
                extraWrap.appendChild(footer);
            }

            const revealButton = document.createElement("button");
            revealButton.type = "button";
            revealButton.className = "summary-reveal-btn";
            revealButton.textContent = "Show more";
            revealButton.addEventListener("click", () => {
                extraWrap.classList.remove("hidden");
                revealButton.remove();
            });

            section.appendChild(revealButton);
            section.appendChild(extraWrap);
        }

        container.appendChild(section);
    }

    if (closingItems.length && takeawayItems.length === 0) {
        const footer = document.createElement("div");
        footer.className = "summary-footer";
        closingItems.forEach(item => {
            const line = document.createElement("p");
            line.textContent = item;
            footer.appendChild(line);
        });
        container.appendChild(footer);
    }
}

function renderBotContent(container, text) {
    const parts = parseResponseSections(text);

    if (parts.intro) {
        const intro = document.createElement("div");
        intro.className = "message-intro";
        intro.textContent = parts.intro;
        container.appendChild(intro);
    }

    if (parts.recommendations.length) {
        const grid = document.createElement("div");
        grid.className = "recommendation-grid";
        parts.recommendations.forEach((item, index) => {
            grid.appendChild(createRecommendationCard(item, index));
        });
        container.appendChild(grid);
    }

    if (parts.closing.length) {
        const closing = document.createElement("div");
        closing.className = "message-closing";
        parts.closing.forEach(line => {
            const paragraph = document.createElement("p");
            paragraph.textContent = line;
            closing.appendChild(paragraph);
        });
        container.appendChild(closing);
    }
}

function renderResearchContent(container, text) {
    const report = document.createElement("div");
    report.className = "research-report";

    if (window.marked) {
        report.innerHTML = window.marked.parse(text);
    } else {
        report.textContent = text;
    }

    container.appendChild(report);
}

function typeTextContent(container, text, onComplete) {
    container.textContent = "";
    let index = 0;
    const timer = window.setInterval(() => {
        container.textContent = text.slice(0, index + 1);
        index += 1;
        if (index >= text.length) {
            window.clearInterval(timer);
            if (onComplete) {
                onComplete();
            }
        }
    }, 8);
}

function renderActionButtons(container, actions) {
    if (!actions || !actions.length) {
        return;
    }

    const sectionNode = document.createElement("div");
    sectionNode.className = "action-section";

    const title = document.createElement("div");
    title.className = "action-section-title";
    title.textContent = "Continue with ET";
    sectionNode.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "action-grid";

    actions.forEach(action => {
        const link = document.createElement("a");
        link.className = "action-link-card";
        link.href = action.url;
        link.target = "_blank";
        link.rel = "noreferrer";

        const label = document.createElement("div");
        label.className = "action-link-label";
        label.textContent = action.label;
        link.appendChild(label);

        if (action.headline) {
            const headline = document.createElement("div");
            headline.className = "action-link-headline";
            headline.textContent = action.headline;
            link.appendChild(headline);
        }

        const description = document.createElement("div");
        description.className = "action-link-description";
        description.textContent = action.description;
        link.appendChild(description);

        grid.appendChild(link);
    });

    sectionNode.appendChild(grid);
    container.appendChild(sectionNode);
}

function initDashboardPage() {
    const chatContainer = document.getElementById("chat-container");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");
    const loadingIndicator = document.getElementById("loading");
    const systemStatus = document.getElementById("system-status");
    const simplifyLevelSelect = document.getElementById("simplify-level");
    const simplifyField = simplifyLevelSelect?.closest(".field");
    const languageSelect = document.getElementById("language-select");
    const sourcePanel = document.getElementById("source-panel");
    const sourceLink = document.getElementById("source-link");
    const sourceText = document.getElementById("source-text");
    const modeIndicator = document.getElementById("mode-indicator");
    const reportButton = document.getElementById("report-button");
    const downloadReportButton = document.getElementById("download-report-button");
    const reportPreview = document.getElementById("report-preview");
    const reportPreviewTitle = document.getElementById("report-preview-title");
    const reportPreviewMeta = document.getElementById("report-preview-meta");
    const reportPreviewBody = document.getElementById("report-preview-body");
    const quickActions = document.querySelector(".quick-actions");
    const quickActionButtons = Array.from(document.querySelectorAll("[data-quick-message]"));
    const sectionShortcuts = document.getElementById("section-shortcuts");
    const historyList = document.getElementById("history-list");
    const historyPanelCopy = document.getElementById("history-panel-copy");
    const inputContainer = document.querySelector(".input-container");
    const userMenuTrigger = document.getElementById("user-menu-trigger");
    const userMenuPanel = document.getElementById("user-menu-panel");
    const userMenuName = document.getElementById("user-menu-name");
    const userMenuIcon = document.getElementById("user-menu-icon");
    const settingsDisplayName = document.getElementById("settings-display-name");
    const settingsDefaultMode = document.getElementById("settings-default-mode");
    const settingsDefaultSimplifyLevel = document.getElementById("settings-default-simplify-level");
    const settingsLanguage = document.getElementById("settings-language");
    const saveSettingsButton = document.getElementById("save-settings-button");
    const resetProfileButton = document.getElementById("reset-profile-button");
    const sectionGreeting = document.getElementById("section-greeting");
    const profile = loadProfile();
    const userSettings = loadSettings();
    const preferredDisplayName = getPreferredDisplayName(profile, userSettings);
    const personality = detectPersonality(profile);
    let conversationHistory = loadConversationHistory(section, userSettings.default_mode || "chat");
    let activeMode = userSettings.default_mode || "chat";
    let lastUserMessage = "";
    let lastReport = {
        title: "ET AI Concierge Report",
        date: "",
        content: "",
        question: ""
    };

    document.getElementById("profile-user-type").textContent = `Type: ${profile.user_type}`;
    document.getElementById("profile-goal").textContent = `Goal: ${profile.goal}`;
    document.getElementById("profile-risk").textContent = `Risk: ${profile.risk}`;
    document.getElementById("personality-badge").textContent = `Detected Profile: ${personality}`;
    userMenuName.textContent = preferredDisplayName;
    userMenuIcon.textContent = getDisplayInitials(preferredDisplayName);
    settingsDisplayName.value = preferredDisplayName;
    settingsDefaultMode.value = userSettings.default_mode || "chat";
    settingsDefaultSimplifyLevel.value = userSettings.default_simplify_level || "basic";
    simplifyLevelSelect.value = userSettings.default_simplify_level || "basic";
    settingsLanguage.value = userSettings.language || "english";
    languageSelect.value = userSettings.language || "english";
    if (sectionGreeting) {
        const firstName = profile.first_name || preferredDisplayName.split(" ")[0] || "there";
        sectionGreeting.textContent = `Hi ${firstName}`;
    }
    const riskIndicator = document.getElementById("risk-indicator-card");
    if (riskIndicator) {
        riskIndicator.textContent = `${profile.risk || "Medium"} risk profile`;
    }
    if (downloadReportButton) {
        downloadReportButton.disabled = true;
    }

    function renderEmptyState(mode) {
        chatContainer.innerHTML = "";
        const shell = document.createElement("div");
        shell.className = "empty-state";

        const title = document.createElement("div");
        title.className = "empty-state-title";
        title.textContent = mode === "research"
            ? "Research deeper with your AI analyst"
            : mode === "simplify"
                ? "Let your AI simplify it step by step"
                : mode === "summarize"
                    ? "Paste an article URL or text to summarize"
                    : "Start a conversation with your AI concierge";
        shell.appendChild(title);

        const copy = document.createElement("div");
        copy.className = "empty-state-copy";
        copy.textContent = mode === "chat"
            ? "Ask anything about investments, markets, finance news, or learning. Your assistant will adapt to this section."
            : "Choose a prompt below or type your own request.";
        shell.appendChild(copy);

        const promptGrid = document.createElement("div");
        promptGrid.className = "empty-prompt-grid";
        getQuickActionConfig(mode).slice(0, 4).forEach(prompt => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "empty-prompt-btn";
            button.textContent = prompt;
            button.addEventListener("click", () => {
                messageInput.value = prompt;
                sendButton.click();
            });
            promptGrid.appendChild(button);
        });
        shell.appendChild(promptGrid);
        chatContainer.appendChild(shell);
    }

    function renderConversationHistoryList(mode) {
        chatContainer.innerHTML = "";

        if (!conversationHistory.length) {
            renderEmptyState(mode);
            return;
        }

        conversationHistory.forEach(item => {
            addMessage(
                item.content,
                item.role === "user",
                null,
                "",
                [],
                "",
                [],
                [],
                item.mode || mode,
                "",
                { skipTyping: true, skipReportUpdate: item.role !== "assistant", messageId: item.id || "" }
            );
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function formatHistoryTime(timestamp) {
        if (!timestamp) {
            return "Recent";
        }

        try {
            return new Date(timestamp).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit"
            });
        } catch (error) {
            return "Recent";
        }
    }

    function renderHistorySidebar(mode) {
        if (!historyList) {
            return;
        }

        if (historyPanelCopy) {
            historyPanelCopy.textContent = `Recent prompts in ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
        }

        historyList.innerHTML = "";
        const userPrompts = conversationHistory.filter(item => item.role === "user");

        if (!userPrompts.length) {
            const empty = document.createElement("div");
            empty.className = "history-empty";
            empty.textContent = "No prompts yet in this mode. Your Ask AI, Research, Simplify, and Summarize histories stay separate.";
            historyList.appendChild(empty);
            return;
        }

        userPrompts
            .slice()
            .reverse()
            .forEach((item, index) => {
                const entry = document.createElement("button");
                entry.type = "button";
                entry.className = `history-item${index === 0 ? " active" : ""}`;

                const title = document.createElement("div");
                title.className = "history-item-title";
                title.textContent = item.content;
                entry.appendChild(title);

                const meta = document.createElement("div");
                meta.className = "history-item-meta";
                meta.textContent = formatHistoryTime(item.timestamp);
                entry.appendChild(meta);

                entry.addEventListener("click", () => {
                    const targetId = item.id;
                    if (!targetId) {
                        messageInput.value = item.content;
                        messageInput.focus();
                        return;
                    }

                    const targetMessage = chatContainer.querySelector(`[data-history-id="${targetId}"]`);
                    if (targetMessage) {
                        targetMessage.scrollIntoView({ behavior: "smooth", block: "center" });
                    } else {
                        messageInput.value = item.content;
                        messageInput.focus();
                    }
                });

                historyList.appendChild(entry);
            });
    }

    function renderSectionShortcuts() {
        if (!sectionShortcuts) {
            return;
        }

        sectionShortcuts.innerHTML = "";
        const shortcuts = getSectionShortcutConfig(section);

        shortcuts.forEach(item => {
            if (item.type === "link") {
                const link = document.createElement("a");
                link.className = "sidebar-shortcut sidebar-shortcut-link";
                link.href = item.value;
                link.target = "_blank";
                link.rel = "noreferrer";

                const label = document.createElement("span");
                label.className = "sidebar-shortcut-label";
                label.textContent = item.label;
                link.appendChild(label);

                const action = document.createElement("span");
                action.className = "sidebar-shortcut-action";
                action.textContent = "Open";
                link.appendChild(action);

                sectionShortcuts.appendChild(link);
                return;
            }

            const button = document.createElement("button");
            button.type = "button";
            button.className = "sidebar-shortcut";
            button.textContent = item.label;
            button.addEventListener("click", () => {
                messageInput.value = item.value;
                sendButton.click();
            });
            sectionShortcuts.appendChild(button);
        });
    }

    function getQuickActionConfig(mode) {
        const configs = {
            investment: {
                chat: ["Start SIP", "Explore Stocks", "Compare Mutual Funds", "Low Risk Portfolio", "Tata Stocks", "Dividend Stocks"],
                research: ["Research Tata Motors", "Compare Banking Stocks", "Research EV Sector", "Best SIP Options", "Blue Chip Stocks", "Market Valuation"],
                simplify: [],
                summarize: [],
                alerts: [],
                highlights: []
            },
            news: {
                chat: ["Latest News", "Market Trends", "Sensex Update", "Oil Prices", "RBI Policy", "Top Headlines"],
                research: ["Research Oil Prices", "Research RBI Policy", "Research Inflation", "Research Global Markets", "Research Budget Impact", "Research Banking News"],
                simplify: [],
                summarize: [],
                alerts: [],
                highlights: []
            },
            learning: {
                chat: ["Learn Basics", "View Courses", "What Is SIP", "Mutual Fund Basics", "Risk vs Return", "Stock Market Terms"],
                research: ["Research SIP Basics", "Research Mutual Funds", "Research Compounding", "Research Asset Allocation", "Research Retirement Planning", "Research Tax Basics"],
                simplify: [],
                summarize: [],
                alerts: [],
                highlights: []
            }
        };

        const sectionConfig = configs[section] || configs.news;
        return sectionConfig[mode] || [];
    }

    function updateSystemStatus(source = "groq") {
        systemStatus.textContent = source === "fallback"
            ? "ET Concierge ready with guided recommendations"
            : "ET Concierge ready";
    }

    function updateModeUI(mode) {
        activeMode = mode;
        conversationHistory = loadConversationHistory(section, mode);
        document.querySelectorAll(".mode-btn").forEach(button => {
            button.classList.toggle("active", button.dataset.mode === mode);
        });
        modeIndicator.textContent = `Mode: ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;

        const modeSettings = {
            chat: {
                showSimplify: false,
                showSource: false,
                showQuickActions: true,
                showInput: true,
                showReport: true,
                sendLabel: "Send",
                placeholder: section === "investment"
                    ? "Ask about SIPs, stocks, or ET Markets..."
                    : section === "learning"
                        ? "Ask about basics, courses, or ET Masterclass..."
                        : "Ask about trends, updates, or today's ET news..."
            },
            research: {
                showSimplify: false,
                showSource: false,
                showQuickActions: true,
                showInput: true,
                showReport: true,
                sendLabel: "Research",
                placeholder: section === "investment"
                    ? "Research a stock, sector, or investing question..."
                    : section === "learning"
                        ? "Research a topic, concept, or learning path..."
                        : "Research a news topic, event, or market trend..."
            },
            simplify: {
                showSimplify: true,
                showSource: false,
                showQuickActions: false,
                showInput: true,
                showReport: true,
                sendLabel: "Simplify",
                placeholder: "Ask for a simpler explanation, definition, steps, or example..."
            },
            summarize: {
                showSimplify: false,
                showSource: true,
                showQuickActions: false,
                showInput: true,
                showReport: true,
                sendLabel: "Summarize",
                placeholder: "Optional: add a short summary instruction..."
            },
            alerts: {
                showSimplify: false,
                showSource: false,
                showQuickActions: false,
                showInput: true,
                showReport: false,
                sendLabel: "Generate Alerts",
                placeholder: "Ask for alerts about a company, sector, or market theme..."
            },
            highlights: {
                showSimplify: false,
                showSource: false,
                showQuickActions: false,
                showInput: true,
                showReport: false,
                sendLabel: "Get Highlights",
                placeholder: "Ask for today's highlights on a topic or market area..."
            }
        };

        const settings = modeSettings[mode] || modeSettings.chat;

        if (simplifyField) {
            simplifyField.classList.toggle("hidden", !settings.showSimplify);
        }
        simplifyLevelSelect.disabled = !settings.showSimplify;
        if (sourcePanel) {
            sourcePanel.classList.toggle("hidden", !settings.showSource);
        }
        if (quickActions) {
            quickActions.classList.toggle("hidden", !settings.showQuickActions);
        }
        if (inputContainer) {
            inputContainer.classList.toggle("hidden", !settings.showInput && !settings.showSource);
        }
        if (reportButton) {
            reportButton.classList.toggle("hidden", !settings.showReport);
        }
        sendButton.textContent = settings.sendLabel;
        messageInput.placeholder = settings.placeholder;

        const quickActionLabels = getQuickActionConfig(mode);
        quickActionButtons.forEach((button, index) => {
            const label = quickActionLabels[index];
            button.classList.toggle("hidden", !label);
            if (label) {
                button.dataset.quickMessage = label;
                button.textContent = label;
            }
        });

        renderConversationHistoryList(mode);
        renderHistorySidebar(mode);
    }

    function renderInfoCards(container, cards = [], label = "Insights") {
        if (!cards.length) {
            return;
        }

        const sectionNode = document.createElement("div");
        sectionNode.className = "insight-section";

        const title = document.createElement("div");
        title.className = "action-section-title";
        title.textContent = label;
        sectionNode.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "insight-grid";

        cards.forEach(card => {
            const cardNode = document.createElement("div");
            cardNode.className = "insight-card";

            const heading = document.createElement("div");
            heading.className = "insight-card-title";
            heading.textContent = card.title;
            cardNode.appendChild(heading);

            const description = document.createElement("div");
            description.className = "insight-card-description";
            description.textContent = card.description;
            cardNode.appendChild(description);

            grid.appendChild(cardNode);
        });

        sectionNode.appendChild(grid);
        container.appendChild(sectionNode);
    }

    function addMessage(text, isUser = false, responseProfile = null, responsePersonality = "", categories = [], source = "", actions = [], cards = [], mode = "chat", responseDate = "", options = {}) {
        const skipTyping = Boolean(options.skipTyping);
        const skipReportUpdate = Boolean(options.skipReportUpdate);
        const shouldStickToBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 120;
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;
        if (options.messageId) {
            messageDiv.dataset.historyId = options.messageId;
        }

        if (!isUser && responseProfile) {
            const info = document.createElement("div");
            info.className = "profile-info";
            info.textContent = `Detected Profile: ${responsePersonality || personality} | ${responseProfile.user_type} | ${responseProfile.goal} | ${responseProfile.risk}`;
            messageDiv.appendChild(info);
        }

        if (!isUser && categories.length) {
            const categoriesDiv = document.createElement("div");
            categoriesDiv.className = "categories";
            categories.forEach(category => {
                const chip = document.createElement("a");
                chip.className = "category-tag";
                chip.href = getCategoryLink(category, section);
                chip.target = "_blank";
                chip.rel = "noreferrer";
                chip.textContent = category;
                categoriesDiv.appendChild(chip);
            });
            messageDiv.appendChild(categoriesDiv);
        }

        if (!isUser && source) {
            const sourceBadge = document.createElement("div");
            sourceBadge.className = `source-badge ${source === "fallback" ? "source-fallback" : "source-live"}`;
            if (source === "fallback") {
                sourceBadge.textContent = "Guided response";
            } else if (source === "local_summary") {
                sourceBadge.textContent = "Ordered summary";
            } else {
                sourceBadge.textContent = "Live AI response";
            }
            messageDiv.appendChild(sourceBadge);
        }

        if (!isUser) {
            const modeBadge = document.createElement("div");
            modeBadge.className = "mode-response-badge";
            modeBadge.textContent = `Mode: ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
            messageDiv.appendChild(modeBadge);
        }

        const content = document.createElement("div");
        content.className = "message-content";

        if (isUser) {
            content.textContent = text;
        } else {
            if (mode === "research") {
                renderResearchContent(content, text);
            } else if (mode === "summarize") {
                renderSummaryContent(content, text);
            } else if (mode === "chat" || mode === "simplify") {
                if (skipTyping) {
                    const plain = document.createElement("div");
                    plain.className = "typed-response";
                    plain.textContent = text;
                    content.appendChild(plain);
                } else {
                    const typed = document.createElement("div");
                    typed.className = "typed-response";
                    content.appendChild(typed);
                    typeTextContent(typed, text);
                }
            } else {
                renderBotContent(content, text);
            }
            renderInfoCards(content, cards, mode === "alerts" ? "Alerts" : "Today's Highlights");
            renderActionButtons(content, actions);
        }

        messageDiv.appendChild(content);
        chatContainer.appendChild(messageDiv);
        if (shouldStickToBottom) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        if (!isUser && !skipReportUpdate) {
            lastReport = {
                title: `${section.charAt(0).toUpperCase()}${section.slice(1)} Report: ${lastUserMessage || "Latest Request"}`,
                date: responseDate,
                content: text,
                question: lastUserMessage
            };
            if (downloadReportButton) {
                downloadReportButton.disabled = false;
            }
        }
    }

    function storeConversationTurn(role, text, mode) {
        const value = String(text || "").trim();
        if (!value) {
            return null;
        }
        const entry = {
            id: createHistoryId(),
            role,
            content: value,
            mode,
            timestamp: new Date().toISOString()
        };
        conversationHistory.push(entry);
        conversationHistory = conversationHistory.slice(-12);
        saveConversationHistory(section, activeMode, conversationHistory);
        renderHistorySidebar(activeMode);
        return entry;
    }

    function showLoading(show = true, label = "") {
        loadingIndicator.style.display = show ? "inline-flex" : "none";
        loadingIndicator.textContent = show ? label : "";
        sendButton.disabled = show;
        messageInput.disabled = show;
    }

    async function sendMessage(message) {
        const loadingLabels = {
            chat: "AI is typing...",
            research: "Analyzing...",
            simplify: "Simplifying...",
            summarize: "Fetching data...",
            alerts: "Generating alerts...",
            highlights: "Generating response..."
        };
        showLoading(true, loadingLabels[activeMode] || "AI is typing...");
        lastUserMessage = message;

        try {
            const response = await fetch("/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message,
                    profile,
                    section,
                    mode: activeMode,
                    simplify_level: simplifyLevelSelect.value,
                    language: languageSelect ? languageSelect.value : "english",
                    conversation_history: conversationHistory,
                    source_link: sourceLink ? sourceLink.value.trim() : "",
                    source_text: sourceText ? sourceText.value.trim() : ""
                })
            });

            const data = await response.json();
            updateSystemStatus(data.source);
            addMessage(
                data.reply,
                false,
                data.profile,
                data.personality,
                data.categories || [],
                data.source,
                data.actions || [],
                data.cards || [],
                data.mode || activeMode,
                data.date || ""
            );
            storeConversationTurn("assistant", data.reply, data.mode || activeMode);
        } catch (error) {
            updateSystemStatus("fallback");
            addMessage("Sorry, I'm having trouble connecting right now. Please try again.");
            storeConversationTurn("assistant", "Sorry, I'm having trouble connecting right now. Please try again.", activeMode);
        } finally {
            showLoading(false);
        }
    }

    async function triggerSummarize() {
        const linkValue = sourceLink ? sourceLink.value.trim() : "";
        const textValue = sourceText ? sourceText.value.trim() : "";

        if (!textValue && !linkValue) {
            sourceText?.focus();
            return;
        }

        const prompt = messageInput.value.trim() || "Summarize pasted ET content";
        await sendMessage(prompt);
    }

    function renderReportPreview() {
        if (!lastReport.content) {
            return;
        }

        reportPreviewTitle.textContent = lastReport.title;
        reportPreviewMeta.textContent = `Based on: ${lastReport.question || "Latest request"} | ${lastReport.date || "Today"}`;
        reportPreviewBody.innerHTML = "";

        const questionBlock = document.createElement("div");
        questionBlock.className = "report-block";

        const questionTitle = document.createElement("div");
        questionTitle.className = "report-block-title";
        questionTitle.textContent = "User Request";
        questionBlock.appendChild(questionTitle);

        const questionText = document.createElement("div");
        questionText.className = "report-block-text";
        questionText.textContent = lastReport.question || "Latest dashboard request";
        questionBlock.appendChild(questionText);
        reportPreviewBody.appendChild(questionBlock);

        const contentBlock = document.createElement("div");
        contentBlock.className = "report-block";

        const contentTitle = document.createElement("div");
        contentTitle.className = "report-block-title";
        contentTitle.textContent = "Generated Report";
        contentBlock.appendChild(contentTitle);

        lastReport.content.split("\n").forEach(line => {
            const textLine = document.createElement("p");
            textLine.className = "report-line";
            textLine.textContent = line.trim() || " ";
            contentBlock.appendChild(textLine);
        });

        reportPreviewBody.appendChild(contentBlock);
        reportPreview.classList.remove("hidden");
        reportPreview.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function downloadReport() {
        if (!lastReport.content) {
            return;
        }

        try {
            const response = await fetch("/report", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(lastReport)
            });

            if (!response.ok) {
                return;
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${lastReport.title.replace(/\s+/g, "_").toLowerCase()}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
        }
    }

    sendButton.addEventListener("click", async () => {
        const message = messageInput.value.trim();
        if (!message) {
            return;
        }

        const userEntry = storeConversationTurn("user", message, activeMode);
        if (activeMode !== "summarize") {
            addMessage(message, true, null, "", [], "", [], [], activeMode, "", { messageId: userEntry?.id });
        }
        messageInput.value = "";
        await sendMessage(message);
    });

    messageInput.addEventListener("keypress", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendButton.click();
        }
    });

    if (sourceText) {
        sourceText.addEventListener("keydown", async event => {
            if (activeMode === "summarize" && event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                await triggerSummarize();
            }
        });
    }

    document.querySelectorAll("[data-quick-message]").forEach(button => {
        button.addEventListener("click", () => {
            messageInput.value = button.dataset.quickMessage;
            sendButton.click();
        });
    });

    document.querySelectorAll(".mode-btn").forEach(button => {
        button.addEventListener("click", () => {
            updateModeUI(button.dataset.mode);
        });
    });

    document.querySelectorAll("[data-user-tab]").forEach(button => {
        button.addEventListener("click", () => {
            const selectedTab = button.dataset.userTab;
            document.querySelectorAll("[data-user-tab]").forEach(tabButton => {
                tabButton.classList.toggle("active", tabButton.dataset.userTab === selectedTab);
            });
            document.getElementById("user-profile-panel").classList.toggle("hidden", selectedTab !== "profile");
            document.getElementById("user-settings-panel").classList.toggle("hidden", selectedTab !== "settings");
        });
    });

    userMenuTrigger?.addEventListener("click", () => {
        const isHidden = userMenuPanel.classList.contains("hidden");
        userMenuPanel.classList.toggle("hidden", !isHidden);
        userMenuTrigger.setAttribute("aria-expanded", String(isHidden));
    });

    document.addEventListener("click", event => {
        if (!userMenuPanel || !userMenuTrigger) {
            return;
        }
        if (!userMenuPanel.contains(event.target) && !userMenuTrigger.contains(event.target)) {
            userMenuPanel.classList.add("hidden");
            userMenuTrigger.setAttribute("aria-expanded", "false");
        }
    });

    saveSettingsButton?.addEventListener("click", () => {
        const nextSettings = {
            display_name: settingsDisplayName.value.trim() || "ET User",
            default_mode: settingsDefaultMode.value,
            default_simplify_level: settingsDefaultSimplifyLevel.value,
            language: settingsLanguage.value
        };
        saveSettings(nextSettings);
        userMenuName.textContent = nextSettings.display_name;
        userMenuIcon.textContent = getDisplayInitials(nextSettings.display_name);
        simplifyLevelSelect.value = nextSettings.default_simplify_level;
        languageSelect.value = nextSettings.language;
        updateModeUI(nextSettings.default_mode);
    });

    resetProfileButton?.addEventListener("click", () => {
        saveProfile({ ...defaultProfile });
        window.location.reload();
    });

    reportButton.addEventListener("click", renderReportPreview);
    downloadReportButton.addEventListener("click", downloadReport);
    document.getElementById("summarize-button")?.addEventListener("click", triggerSummarize);

    updateModeUI(activeMode);
    updateSystemStatus("groq");
    renderSectionShortcuts();
}

document.addEventListener("DOMContentLoaded", () => {
    if (pageType === "home") {
        initHomePage();
        return;
    }

    if (pageType === "dashboard") {
        initDashboardPage();
    }
});
