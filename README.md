# Virtual Teammate — Lead CRM

A lightweight, fully client-side Lead CRM branded for [Virtual Teammate](https://www.virtualteammate.com/).

## Features
- **7-stage pipeline** — Leads → MQLs → SQLs → Deals → Closed Won / Closed Lost → Client, with drag-and-drop between stages
- **Analytics** — funnel conversion, deal value by stage, sources, stage aging, win rate & MRR
- **Sales Coach** — per-lead coaching advice with follow-up cadences (Lead 3d · MQL 5d · SQL 7d · Deal 4d · Client 30d)
- **Daily Plan alerts** — a "do today" briefing (NOW / TODAY / THIS WEEK) plus a red badge on the Sales Coach tab so nothing is missed
- **Local accounts** — sign up / sign in / password recovery (recovery email), SHA-256 hashed passwords
- **Google Sheets export** — copy-for-sheets, single CSV (leads + summary), or two separate CSVs

## Run
Static site — open `index.html`, or serve the folder:
```
npx serve .
```

## Deploy
Any static host works (Vercel / Netlify / GitHub Pages). Data persists in browser localStorage.
