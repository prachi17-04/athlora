# ATHLORA — The Anti-Sedentary Engine

ATHLORA helps inactive students become active. It turns free minutes into small, achievable **Move Missions**, checks the moves with the phone or laptop camera, and rewards **personal improvement** rather than raw athletic ability.

One codebase runs as a **website** and as an **installable phone app** (a Progressive Web App, or PWA).

## Features

| Feature | Where |
|---|---|
| Sign-up: name → email → **email OTP** → age → medical conditions → sports | First launch |
| **Today's Consistency** panel (ring, streak, 7-day dots, nudge) | Dashboard only |
| **Context-aware Move Missions** (time, fitness level, goal, environment, equipment, recent activity) | Move tab |
| **Classroom mode** (quiet seated moves plus a walking mission after class) | Move → Classroom |
| **Real-time computer-vision verification** (squats, push-ups, jumping jacks, high knees, plank); verified moves earn 1.5× XP | Move → Verify with camera |
| **AI Fitness Baseline** (camera assessment → fitness level + mobility score) | AI Setup tab |
| **Fitness Growth Index (FGI)**: % improvement against your own baseline | Passport tab |
| **Comeback mode** ("You were inactive for N days, restart with a 4-min mission") | Dashboard |
| **Campus challenge**: a shared weekly goal with no rankings | Campus tab |
| Progress visualisation, badges, Fitness Passport | Passport tab |

The bottom navigation holds Dashboard, AI Setup, Move, Passport, and Campus.
There is **no dummy data**. Every number comes from real missions and assessments stored in `data/athlora.json`.

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

Without email settings, the app runs in **dev mode**: the OTP code is printed in the terminal instead of being emailed.

## 3. Send real OTP emails (Gmail)

1. Turn on **2-Step Verification** for the Google account at https://myaccount.google.com/security.
2. Create an **App password** at https://myaccount.google.com/apppasswords.
3. Edit `.env`:
   ```
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=the16charapppassword
   MAIL_FROM="ATHLORA <youraddress@gmail.com>"
   APP_SECRET=any-long-random-text
   ```
4. Restart with `npm start`. The terminal should say `SMTP configured`.

Any SMTP provider works, for example Brevo, SendGrid, Zoho, or Outlook. Change `SMTP_HOST` and `SMTP_PORT` to match the provider.

## 4. Use it as a phone app

Phone browsers only allow **camera access over HTTPS**, so the app must be deployed first:

1. Deploy it (see step 5). You get a URL like `https://athlora.onrender.com`.
2. Open that URL on the phone:
   - **Android (Chrome):** menu ⋮ → **Install app** / **Add to Home screen**
   - **iPhone (Safari):** Share → **Add to Home Screen**
3. ATHLORA then opens full screen with its own icon, like a native app.

To publish on the **Play Store or App Store** later, wrap the same `public/` folder with [Capacitor](https://capacitorjs.com) (`npx cap add android`) and point it at the deployed server URL.

## 5. Deploy (Render, Railway, or any Node host)

- Build command: `npm install`
- Start command: `npm start`
- Environment variables: the values from your `.env`
- **Add a persistent disk mounted at `/data` in the project folder.** Without it, some hosts erase the user data on every redeploy. For more than a few hundred users, move `server/db.js` to PostgreSQL or MongoDB. The routes don't need to change.

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
│  ├─ index.js     API: auth/OTP, onboarding, missions, assessments, stats, campus
│  ├─ engine.js    Fitness Opportunity Engine + scoring + FGI
│  ├─ mailer.js    OTP email (nodemailer)
│  └─ db.js        JSON-file storage (data/athlora.json)
└─ public/         The website / PWA
   ├─ index.html, manifest.webmanifest, sw.js, icons/, css/styles.css
   └─ js/
      ├─ app.js          router + bottom navigation
      ├─ onboarding.js   name → email → OTP → age → medical → sports
      ├─ tracker.js      computer-vision rep counter
      └─ views/          dashboard, move, setup (AI Setup), passport, campus
```
