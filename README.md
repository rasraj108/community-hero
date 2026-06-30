# CivicPulse — Community Hero

> **Vibe2Ship Hackathon Submission** | Problem Statement: Community Hero - Hyperlocal Problem Solver

**Live App:** https://community-hero-2778b.web.app

---

## Problem Statement

Communities face daily issues — potholes, broken streetlights, water leaks, waste management failures — but reporting is fragmented, untracked, and lacks transparency. Citizens have no easy way to report, validate, or follow up on local problems.

## Solution

CivicPulse is a platform where citizens can **report, verify, track, and resolve** community issues through AI-powered automation, geolocation, and gamification.

---

## Key Features

- **AI-Powered Issue Categorization** — Upload a photo and Gemini AI instantly identifies the issue type, severity, responsible department, and resolution timeline
- **AI Cost, Materials & Jurisdiction Estimation** — Gemini appends an estimated repair cost, materials required, and the responsible jurisdiction
- **Voice-Native Reporting** — Speak a report; Gemini extracts category, location, and severity hands-free
- **Autonomous AI Civic Agent** — Analyzes all reports to surface hotspots, rank priorities, and predict high-risk categories
- **Conversational AI Data Agent** — Officials query the dataset in plain English and get data-grounded answers
- **Weather-Aware Predictive Alerts** — Correlates the live forecast with history to flag at-risk areas proactively
- **Geo-Temporal Duplicate Detection** — Warns when an issue was likely already reported nearby
- **AI Complaint-Letter Generation** — Drafts a formal, ready-to-send grievance letter for escalated issues
- **Conversational AI Assistant** — In-app Gemini chatbot that answers civic questions and guides users
- **Auto-Escalation Engine** — Flags high-support issues left unresolved past a threshold
- **Interactive Live Map + Heatmap + Clustering** — Real-time, color-coded markers, heatmap mode, and elegant pin clustering
- **Resolution Loop** — Officials upload before/after proof photos; the original reporter is notified to verify
- **Community Verification** — Citizens upvote/verify issues to prioritize resolution
- **Real-Time Issue Feed** — Browse, filter, and track all community issues by status
- **Impact Dashboard** — Live stats, Google Charts visualizations, and AI-generated community insights
- **Grounded Gamification** — Points and a 5-tier civic recognition system (New Resident → Verified Resident → Civic Contributor → Community Advocate → Civic Champion) with a live leaderboard
- **Citizen, Official & Admin Experiences** — A minimalist citizen app, an enterprise Triage Command Center (bulk dispatch, AI sorting), and a real-time master control panel
- **Google Sign-In + Guest Access** — Frictionless onboarding for everyone
- **Premium UI** — Light/Dark themes, glassmorphic mobile bottom nav, 3D micro-interactions, and a guided first-run tutorial

---

## Technologies Used

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| AI | Google Gemini API (`gemini-2.5-flash`) |
| Database | Firebase Firestore (real-time) |
| Storage | Firebase Storage (image uploads) |
| Auth | Firebase Authentication (Google Sign-In + Anonymous) |
| Maps | Leaflet.js + OpenStreetMap / CartoDB tiles, Leaflet.heat, Leaflet.markercluster |
| Charts | Google Charts |
| Voice | Web Speech API → Gemini parsing |
| Weather | Open-Meteo API (keyless) |
| Hosting | Firebase Hosting (Google Cloud) |

## Google Technologies Used

- **Google Gemini API** (`gemini-2.5-flash`) — photo analysis, issue categorization, autonomous Civic Agent, dashboard insights, conversational assistant, and complaint-letter generation (JSON-structured responses)
- **Firebase Firestore** — real-time NoSQL database for issues, users, sessions, activity, and feedback
- **Firebase Storage** — image upload and CDN delivery (issue + before/after photos)
- **Firebase Authentication** — Google Sign-In and anonymous identity, gamification, and admin access control
- **Firebase Hosting** — public deployment on Google Cloud
- **Google Charts** — impact dashboard visualizations

---

## How It Works

1. Citizen clicks **+ Report Issue**
2. Uploads a photo of the problem
3. **Gemini AI** analyzes the photo → auto-fills title, category, severity, description, and department
4. Citizen confirms location (auto-detected via GPS)
5. Issue is saved to **Firestore** and appears on the live map instantly
6. Other citizens can **verify** the issue (+5 points each)
7. Authorities can update status to **In Progress** or **Resolved**
8. **Dashboard** shows community-wide trends and AI-generated insights

---

## Local Development

```bash
# 1. Add your API keys
#    Copy config.example.js to config.js and fill in your Gemini, Maps,
#    and Firebase keys (config.js is git-ignored so secrets stay local).
cp config.example.js config.js

# 2. Serve locally
py -m http.server 8080 --directory .

# 3. Open in browser
http://localhost:8080
```

> **Note:** `config.js` holds live API keys and is intentionally excluded from this
> repository. The deployed app at the link above is fully functional without any setup.

## Deployment

```bash
firebase deploy --only hosting
```
