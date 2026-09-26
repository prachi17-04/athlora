# ATHLORA — The Anti-Sedentary Engine

ATHLORA helps inactive students become active. It turns free minutes into small, achievable **Move Missions**, checks the moves with the phone or laptop camera, and rewards **personal improvement** rather than raw athletic ability.

One codebase runs as a **website** and as an **installable phone app** (a Progressive Web App, or PWA).

## Features

| Feature | Where |
|---|---|
| Sign-up: name → email → age → medical conditions → sports (the same email signs you back in) | First launch |
| **Today's Consistency** panel (ring, streak, 7-day dots, nudge) | Dashboard only |
| **Context-aware Move Missions** (time, fitness level, goal, environment, equipment, recent activity) | Move tab |
| **Classroom mode** (quiet seated moves plus a walking mission after class) | Move → Classroom |
| **Real-time computer-vision verification** (squats, push-ups, jumping jacks, high knees, plank); verified moves earn 1.5× XP | Move → Verify with camera |
| **AI Fitness Baseline** (camera assessment → fitness level + mobility score) | AI Setup tab |
| **Fitness Growth Index (FGI)**: % improvement against your own baseline | Passport tab |
| **Comeback mode** ("You were inactive for N days, restart with a 4-min mission") | Dashboard |
| **Community challenge**: a shared weekly goal for a college, class, hostel or club, with no rankings | Community tab |
| Progress visualisation, badges, Fitness Passport | Passport tab |
| **Timetable-aware Opportunity Engine**: finds free gaps between classes, adds mid-lecture resets in long lectures, and reminds you when a window starts | AI Setup → Class timetable; Dashboard |
| **AI form-quality score** per rep (depth, tempo, symmetry, body line), with a coaching tip and a +20% XP bonus at 80+ | Move → Verify with camera |
| **Fit India Fitness Protocol alignment**: camera tests cover muscular endurance, core, cardio, flexibility (forward fold) and balance (single-leg stand) | AI Setup; Passport |
| **Institution dashboard** for PE departments: anonymous trends, when-students-move heatmap, Fit India averages, suggestions (needs 5+ students) | `/institution.html` (linked from Community) |
| **Seated / adaptive mode**: chair- and wheelchair-friendly missions and a seated arm-raise test | AI Setup → Movement mode |
| **Adaptive difficulty**: each move's target learns from your verified results (two strong sessions → +10%, two tough ones → −10%; self-reported work never raises it) | Move; Passport → Your adaptive targets |
| **Posture Guardian study mode**: on-device posture check (slouching, leaning in, tilt) calibrated to you, sitting-time break prompts | Dashboard → Posture Guardian (`#/study`) |
| **Phone-sensor verification** of walks and stairs: accelerometer step counting, cadence, no wearable | Move → Track with phone sensors |
| **Teacher-led class movement break**: projector screen with QR and join code, synced routine on every phone, XP for participants | Community → Class movement break; `/break.html` |
| **Verifiable Fitness Certificate**: printable certificate with a QR code; anyone can verify it | Passport → Verified Fitness Certificate; `/verify.html` |
| **Institution impact report**: before vs after, week-by-week table, Fit India changes; print to PDF or download CSV | Institution dashboard → Impact report |
| **Move buddies (unlimited)**: one reusable code, a separate shared streak with each friend, and +10 XP when you move after a buddy on the same day | Community tab |

The bottom navigation holds Dashboard, AI Setup, Move, Passport, and Community.

The dashboard opens with a **daily streak banner** ("Let's go! You have a 5-day streak going on!") with the next milestone and a one-tap mission to keep the streak alive.
There is **no dummy data**. Every number comes from real missions and assessments.

Sign-in uses name and email only, with no verification code. Anyone who knows a student's email can open that account. That's fine for a pilot, but add email verification before storing anything sensitive.

Following the design notes, the app deliberately does **not** include diet or calorie tracking, a huge exercise library, medical diagnosis, a chatbot, a leaderboard, or wearable integration.

---

## 1. Install Node.js (one time)

Download the **LTS** installer from https://nodejs.org and run it. Then open a **new** terminal and check that it worked:

```powershell
node -v
npm -v
```

## 2. Install and run

```powershell
cd C:\Users\DELL\athlora
npm install
copy .env.example .env
npm start
```

Open **http://localhost:3000**.

## 3. Use it as a phone app

Phone browsers only allow **camera access over HTTPS**, so the app must be deployed first:

1. Deploy it (see step 4). You get a URL like `https://athlora.netlify.app`.
2. Open that URL on the phone:
   - **Android (Chrome):** menu ⋮ → **Install app** / **Add to Home screen**
   - **iPhone (Safari):** Share → **Add to Home Screen**
3. ATHLORA then opens full screen with its own icon, like a native app.

To publish on the **Play Store or App Store** later, wrap the same `public/` folder with [Capacitor](https://capacitorjs.com) (`npx cap add android`) and point it at the deployed server URL.

## 4. Deploy on Netlify

The repo includes `netlify.toml`, so Netlify already knows what to do:

- It publishes the `public/` folder as the website.
- It runs the API (`netlify/functions/api.mjs`) as a Netlify Function.
- It stores all user data in **Netlify Blobs**, which is built in, free, and needs no setup.

Steps:

1. On Netlify, open **Add new site → Import an existing project → GitHub** and pick `athlora`.
   Leave the build settings empty, because `netlify.toml` fills them in.
2. Recommended: go to **Site configuration → Environment variables** and add `APP_SECRET` (any long random text) with **All scopes**.
3. Open **Deploys → Trigger deploy → Deploy site**. Every later push to GitHub redeploys automatically.

To check a deployment, open `https://<your-site>.netlify.app/api/health`. It reports whether storage works.

When running locally (`npm start`), the same API uses a JSON file in `data/` instead of Blobs.

## 5. Deploy on Vercel (alternative)

The repo also includes `vercel.json` and `api/index.js`, which runs the same API as a Vercel Function. Vercel has no built-in storage like Netlify Blobs, so connect a free **Upstash Redis** database:

1. Import the GitHub repo into Vercel. Leave the settings as they are, because `vercel.json` fills them in.
2. In the Vercel project, open **Storage → Create Database → Upstash (Redis)**, create the database, and **connect it to this project**. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. Optional: add `APP_SECRET` under **Settings → Environment Variables**.
4. Open **Deployments**, click **⋯** on the latest deployment, then **Redeploy**.

Check it at `https://<your-project>.vercel.app/api/health`. `"storage":"ok"` means it's ready.

---

## How it works

```
Student ─► Context Engine (time · fitness · goal · environment · equipment · recent activity)
        ─► Activity Engine (server/engine.js) ─► Move Mission
        ─► AI verification (public/js/tracker.js, MediaPipe Pose in the browser)
        ─► Fitness reward (XP, streak, comeback bonus) ─► Growth Index ─► long-term improvement
```

- **Engine 1: Fitness Assessment** (`AI Setup`). The camera counts reps in 30-second tests and measures plank hold and squat depth. `levelFromAssessment()` turns the results into beginner, intermediate, or advanced.
- **Engine 2: Activity Intelligence** (`generateMission()`). It filters a small curated move set by environment, equipment, level, and health (any medical condition means no high-impact moves). It then fills the time budget with a warm-up, goal-weighted main moves, and a finishing stretch.
- **Camera privacy:** pose detection runs on the device. No video is uploaded.
- **XP rules:** each move earns XP for its effort, with 1.5× when camera-verified. There are bonuses for finishing the whole mission, keeping a daily streak, coming back after inactivity, and improving on a re-assessment.

## Project structure

```
athlora/
├─ server/
│  ├─ app.js       API: sign-in, onboarding, missions, assessments, stats, campus
│  ├─ index.js     local server (npm start)
│  ├─ engine.js    Fitness Opportunity Engine + scoring + FGI
│  └─ kv.js        storage: JSON file locally, Netlify Blobs when deployed
├─ netlify/functions/api.mjs  the API as a Netlify Function (serves /api/*)
├─ netlify.toml               Netlify build + redirect settings
└─ public/         The website / PWA
   ├─ index.html, manifest.webmanifest, sw.js, icons/, css/styles.css
   └─ js/
      ├─ app.js          router + bottom navigation
      ├─ onboarding.js   name → email → age → medical → sports
      ├─ tracker.js      computer-vision rep counter + form-quality scoring
      ├─ reminders.js    opportunity reminders (notifications)
      ├─ institution.js  PE department dashboard (public/institution.html)
      └─ views/          dashboard, move, setup (AI Setup), passport, campus
```
