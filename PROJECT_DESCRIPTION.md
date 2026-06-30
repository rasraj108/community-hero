# CivicPulse — Community Hero

**Vibe2Ship Hackathon — Project Description**

**Live Application:** https://community-hero-2778b.web.app
**GitHub Repository:** https://github.com/rasraj108/community-hero
**Problem Statement Selected:** Problem Statement 2 — Community Hero (Hyperlocal Problem Solver)

---

## 1. Problem Statement Selected

**Community Hero — Hyperlocal Problem Solver**

Communities face daily civic problems — potholes, water leakages, broken streetlights, waste pile-ups, and damaged public infrastructure. Today, reporting these issues is fragmented across phone calls, WhatsApp groups, and paper complaints. The process is slow, opaque, and discouraging: citizens rarely know whether anyone received their complaint, which department is responsible, or whether it was ever fixed. This lack of transparency and feedback erodes civic participation and leaves problems unresolved for months.

## 2. Solution Overview

**CivicPulse** is an AI-powered civic engagement platform that lets any citizen **report, verify, track, and help resolve** local issues from a single map-based web app — no installation required.

A citizen simply photographs a problem. Google's **Gemini** vision model instantly understands the image, classifies the issue, estimates its severity, routes it to the correct municipal department, and predicts a resolution timeline. The report is pinned to a live community map, where neighbours can **verify** it to build consensus and priority. An autonomous **AI Civic Agent** continuously analyses all reports to surface hotspots, detect patterns, and recommend where authorities should act first. When an issue is ignored for too long despite strong community support, CivicPulse **auto-escalates** it and can generate a formal, ready-to-send complaint letter to the relevant authority.

The result is a transparent, gamified, end-to-end loop — from photo to fix — that rewards participation and holds the system accountable.

## 3. Key Features

**Reporting & AI Understanding**
- **Photo-based reporting** — snap or upload a photo of any civic issue.
- **Gemini AI auto-categorization** — the vision model fills in title, category, severity, description, and responsible department from the image alone.
- **AI repair-cost, materials & jurisdiction estimation** — Gemini appends an estimated repair cost, the materials likely required, and the specific department/jurisdiction responsible, ready for officials to act on.
- **Voice-native reporting** — citizens can simply *speak* a report; Gemini extracts the category, location, and severity and drafts the full report hands-free.
- **GPS geolocation** — issues are automatically pinned to the citizen's location.
- **Geo-temporal duplicate detection** — uses location + time (Haversine proximity) to warn when an issue has likely already been reported, preventing duplicate tickets.
- **Guided interactive tutorial** — a premium first-run spotlight tour walks new users through reporting.

**Mapping & Tracking**
- **Live interactive map** with color-coded markers by category and severity.
- **Heatmap mode** revealing concentration of problems across an area.
- **Real-time feed** with status filters (Open / In Progress / Resolved).
- **Status lifecycle** — Open → In Progress → Resolved, fully transparent to everyone.
- **Before/After photos** — proof of resolution attached to each fixed issue.

**Agentic Intelligence**
- **AI Civic Agent** — autonomously analyses all reports and produces prioritized recommendations, detected hotspots, and predicted high-risk categories.
- **Conversational AI Data Agent (RAG-style)** — officials can ask the platform questions in plain English ("Which areas have the most unresolved issues?", "Summarize all critical open issues") and get instant, data-grounded answers.
- **Weather-aware predictive alerts** — correlates the live weather forecast with historical reports to proactively flag at-risk areas (e.g., drainage hotspots before heavy rain).
- **AI-generated dashboard insights** — natural-language summaries of community trends.
- **AI complaint-letter generation** — drafts a formal grievance letter (using the AI-determined jurisdiction and estimated cost) for escalated issues.
- **Conversational AI assistant** — an in-app chatbot that answers civic questions and guides users.
- **Auto-escalation engine** — flags issues with high community support that remain unresolved past a threshold.

**Community & Engagement**
- **Community verification** — citizens upvote issues to validate and prioritize them.
- **Grounded gamification** — points and a 5-tier civic recognition system (New Resident → Verified Resident → Civic Contributor → Community Advocate → Civic Champion) with elegant progress rings.
- **Live leaderboard** — recognizes the community's most active contributors.
- **Impact dashboard** — live statistics and Google Charts visualizations of category and severity breakdowns.

**The Resolution Loop (citizen ↔ official)**
- **Status tracker** — citizens follow a linear, e-commerce-style timeline: Reported → Assigned → Crew En Route → Resolved.
- **Proof-of-resolution** — officials upload before/after photos; the original reporter is notified and asked to verify the completed work.

**Two distinct, role-based experiences**
- **Citizen view** — a minimalist, mobile-first consumer experience focused on one-tap reporting and a live map.
- **Official Triage Command Center** — an enterprise-style three-column console (filterable ticket list · ticket detail + map · action panel) with **bulk assignment/dispatch**, AI severity sorting, macro-metrics, and the conversational AI Data Agent.
- **Master Admin Control Panel** — real-time monitoring of sessions, visitor activity, and user feedback (restricted to the admin account).

**Access & Administration**
- **Google Sign-In and guest access** — frictionless onboarding for everyone.
- **Light/Dark themes** and a fully responsive, premium UI with a glassmorphic mobile bottom navigation and map marker clustering.

## 4. Technologies Used

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules), Single-Page App |
| AI / ML | Google Gemini API (`gemini-2.5-flash`) — multimodal vision + text |
| Database | Google Firebase Firestore (real-time NoSQL) |
| File Storage | Google Firebase Storage (image upload + CDN) |
| Authentication | Google Firebase Authentication (Google Sign-In + Anonymous) |
| Mapping | Leaflet.js + CartoDB / OpenStreetMap tiles, Leaflet.heat (heatmap), Leaflet.markercluster |
| Data Visualization | Google Charts |
| Voice | Web Speech API (speech-to-text) → Gemini parsing |
| Weather | Open-Meteo API (keyless forecast for predictive alerts) |
| Hosting / Deployment | Google Firebase Hosting (Google Cloud) |
| Image handling | Client-side image compression before upload |

## 5. Google Technologies Utilized

CivicPulse is built end-to-end on Google's ecosystem:

- **Google Gemini API (`gemini-2.5-flash`)** — the multimodal core of the product. Powers image-based issue categorization, severity and department prediction, the autonomous Civic Agent's analysis, dashboard insight generation, the conversational assistant, and complaint-letter drafting. JSON-structured responses (`responseMimeType: application/json`) are used for reliable, schema-driven outputs.
- **Google Firebase Firestore** — real-time database storing issues, users, sessions, activity logs, and feedback, with live `onSnapshot` updates so every client sees changes instantly.
- **Google Firebase Storage** — stores issue photos and before/after resolution images, served via Google's CDN.
- **Google Firebase Authentication** — handles Google Sign-In and anonymous guest identity, enabling gamification and the admin access model.
- **Google Firebase Hosting** — production deployment on Google Cloud infrastructure with HTTPS and global CDN.
- **Google Charts** — renders the impact dashboard's category and severity visualizations.
- **Google Cloud (Blaze)** — the underlying billing/project platform backing Firestore, Storage, and Hosting.

## 6. Agentic Depth (How the AI acts, not just responds)

CivicPulse goes beyond a single prompt-response interaction:
1. **Perceive** — Gemini interprets a raw photo (or spoken description) into structured civic data: category, severity, department/jurisdiction, estimated repair cost, and materials required.
2. **Reason** — the Civic Agent aggregates all reports to detect hotspots, rank priorities, predict high-risk categories, and correlate live weather forecasts with historical reports to raise proactive alerts; geo-temporal logic clusters likely-duplicate reports.
3. **Act** — it auto-escalates neglected high-support issues, generates formal complaint letters routed to the correct jurisdiction, and equips officials with bulk dispatch and one-tap status/crew assignment, moving users from *reporting* a problem to *driving its resolution*.
4. **Converse** — a citizen assistant answers civic questions contextually, while an official **AI Data Agent** lets authorities query the entire dataset in natural language and get grounded answers.

This perceive → reason → act → converse loop is what turns passive reporting into proactive civic problem-solving.

---

*Document is shared as "anyone with the link can view." Version history is available for review throughout the evaluation period.*
