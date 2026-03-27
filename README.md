# ET AI Financial Concierge

ET AI Financial Concierge is a Flask-based AI product built around the Economic Times ecosystem. Instead of behaving like a generic chatbot, it works like a guided financial concierge that understands the user, personalizes the experience, and connects them to the right ET products, content, and services.

## Problem Statement

The Economic Times has a large ecosystem that includes ET Prime, ET Markets, masterclasses, corporate events, wealth summits, and financial services partnerships. Most users discover only a small part of that ecosystem.

This project solves that by building an AI concierge that:

- understands the user through a short onboarding conversation
- personalizes the journey across investing, news, and learning
- recommends the right ET destination at the right time
- helps users understand what to do next instead of leaving them confused

## What the Product Does

The platform is divided into three AI workspaces:

- `Investment`: helps with SIPs, stocks, mutual funds, risk-aware decisions, and ET Markets discovery
- `News`: explains headlines, trends, RBI/global cues, and why a story matters
- `Learning`: simplifies concepts step by step and supports beginner-friendly finance learning

Across all sections, the AI supports:

- `Chat`
- `Deep Research`
- `Simplify`
- `Summarize`
- PDF report generation
- ET ecosystem recommendations

## Core Features

- Guided onboarding and profile capture
- Personalized dashboard flows
- Section-specific AI experiences
- URL/article summarization using fetched page text
- Language support for English, Hindi, and Marathi
- Chat history by section and mode
- Supabase authentication with email/password and Google sign-in
- Exportable PDF reports

## Tech Stack

- Flask
- Groq API
- Supabase Auth
- JavaScript
- HTML / CSS
- ReportLab
- BeautifulSoup
- httpx

## Key Routes

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/investment`
- `/news`
- `/learning`
- `/chat`
- `/report`
- `/health`

## Run Locally

1. Create and activate a virtual environment
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Add environment variables in `.env`:

```env
GROQ_API_KEY=your_groq_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the app:

```bash
python app.py
```

## Deployment

This repo includes deployment configuration for both:

- `Render`
- `Railway`

Files:

- `render.yaml`
- `railway.json`

## Links

- Repository: https://github.com/Kartikibansod/ET-AI-Financial-Concierge
- Project URL used in deployment setup: https://et-ai-financial-concierge-49vc.onrender.com

## Submission Files

This repo includes:

- `ET_AI_Financial_Concierge_Project_Document.pdf`
- `ET_AI_Financial_Concierge_Executive_Summary.pdf`

## Why This Project Matters

This project turns the ET ecosystem from a collection of disconnected products into one guided AI experience. The user does not need to know whether they need ET Markets, ET Prime, ET Wealth, a webinar, or a financial service. The concierge figures that out and guides them there.
