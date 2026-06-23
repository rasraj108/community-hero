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
- **Interactive Live Map** — All reported issues plotted on a real-time map with color-coded severity markers
- **Community Verification** — Citizens upvote/verify issues to prioritize resolution
- **Real-Time Issue Feed** — Browse, filter, and track all community issues by status
- **Impact Dashboard** — Live stats, category breakdowns, severity charts, and AI-generated community insights
- **Gamification** — Earn points and badges for reporting and verifying issues (Newcomer → Citizen → Reporter → Activist → Champion)
- **Status Tracking** — Issues move from Open → In Progress → Resolved with full transparency

---

## Technologies Used

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) |
| AI | Google Gemini API (`gemini-2.5-flash`) |
| Database | Firebase Firestore (real-time) |
| Storage | Firebase Storage (image uploads) |
| Auth | Firebase Anonymous Authentication |
| Maps | Leaflet.js + OpenStreetMap / CartoDB Dark tiles |
| Hosting | Firebase Hosting |

## Google Technologies Used

- **Google Gemini API** (`gemini-2.5-flash`) — photo analysis, issue categorization, dashboard insights
- **Firebase Firestore** — real-time NoSQL database for issues and user data
- **Firebase Storage** — image upload and CDN delivery
- **Firebase Authentication** — anonymous user identity and gamification tracking
- **Firebase Hosting** — public deployment

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
# Serve locally
py -m http.server 8080 --directory .

# Open in browser
http://localhost:8080
```

## Deployment

```bash
firebase deploy --only hosting
```
