// The ATHLORA API as an Express app. Used by both the local server (server/index.js)
// and the Netlify Function (netlify/functions/api.js).
const crypto = require('crypto');
const express = require('express');
const { sendOtpEmail } = require('./mailer');
const engine = require('./engine');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const uid = () => crypto.randomUUID();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 40);
const clean = (s, max = 80) => String(s ?? '').trim().slice(0, max);
const campusKey = (name) => (name || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Storage keys
const K = {
  user: (id) => `user/${id}`,
  email: (email) => `email/${sha(email)}`,
  otp: (email) => `otp/${sha(email)}`,
  session: (tokenHash) => `session/${tokenHash}`,
  campusPrefix: (name) => `campus/${sha(campusKey(name))}/`,
};

// ---------- dates in the student's local timezone ----------
function tzOffset(req) {
  const o = Number(req.get('X-TZ-Offset'));
  return Number.isFinite(o) && Math.abs(o) <= 840 ? o : 0;
}
function dayKey(ts, offsetMin) {
  return new Date(ts - offsetMin * 60000).toISOString().slice(0, 10);
}
function shiftDay(key, delta) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, age: u.age ?? null,
    medical: u.medical ?? null, sports: u.sports ?? null,
    onboarded: Boolean(u.onboarded), campus: u.campus || '',
    profile: u.profile, createdAt: u.createdAt,
  };
}

function cleanMedical(m) {
  return {
    has: Boolean(m.has),
    conditions: Array.isArray(m.conditions) ? m.conditions.map((c) => clean(c, 40)).slice(0, 10) : [],
    notes: clean(m.notes, 300),
  };
}
function cleanSports(s) {
  return {
    plays: Boolean(s.plays),
    list: Array.isArray(s.list) ? s.list.map((x) => clean(x, 30)).filter(Boolean).slice(0, 10) : [],
  };
}

// ---------- stats (all derived from the student's real records) ----------
function computeStats(user, offset) {
  const now = Date.now();
  const today = dayKey(now, offset);
  const acts = [...(user.activities || [])].sort((a, b) => a.completedAt - b.completedAt);
  const byDay = {};
  for (const a of acts) {
    const k = dayKey(a.completedAt, offset);
    byDay[k] ??= { missions: 0, activeMin: 0, xp: 0 };
    byDay[k].missions++;
    byDay[k].activeMin += a.activeMin;
    byDay[k].xp += a.xp;
  }

  // Streak: consecutive days with a mission, allowed to start from yesterday
  let streak = 0;
  let cursor = byDay[today] ? today : shiftDay(today, -1);
  while (byDay[cursor]) { streak++; cursor = shiftDay(cursor, -1); }

  let best = 0, run = 0, prev = null;
  for (const k of Object.keys(byDay).sort()) {
    run = prev && shiftDay(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }

  const last = acts[acts.length - 1];
  const lastActiveAt = last ? last.completedAt : user.createdAt;
  const inactiveDays = Math.max(0, Math.round((new Date(today) - new Date(dayKey(lastActiveAt, offset))) / DAY_MS));

  const days = (n) => Array.from({ length: n }, (_, i) => {
    const k = shiftDay(today, i - n + 1);
    return { day: k, ...(byDay[k] || { missions: 0, activeMin: 0, xp: 0 }) };
  });

  const assessments = [...(user.assessments || [])].sort((a, b) => a.createdAt - b.createdAt);
  const baseline = assessments[0] || null;
  const latest = assessments[assessments.length - 1] || null;

  const xp = user.xp || 0;
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const levelFloor = 50 * (level - 1) ** 2;
  const levelCeil = 50 * level ** 2;

  const todayStats = byDay[today] || { missions: 0, activeMin: 0, xp: 0 };
  return {
    today: { ...todayStats, activeMin: Math.round(todayStats.activeMin * 10) / 10, goalMin: 10 },
    streak, bestStreak: best,
    comeback: inactiveDays >= 2, inactiveDays, hasActivity: acts.length > 0,
    xp, level, levelProgress: (xp - levelFloor) / (levelCeil - levelFloor), nextLevelXp: levelCeil,
    week: days(7), last14: days(14),
    totals: {
      missions: acts.length,
      activeMin: Math.round(acts.reduce((s, a) => s + a.activeMin, 0)),
      verifiedMoves: acts.reduce((s, a) => s + a.verifiedCount, 0),
      comebacks: acts.filter((a) => a.comeback).length,
    },
    recent: acts.slice(-5).reverse().map((a) => ({
      title: a.title, xp: a.xp, activeMin: a.activeMin, verifiedCount: a.verifiedCount, completedAt: a.completedAt,
    })),
    baseline, latest,
    assessments: assessments.map((a) => ({ id: a.id, createdAt: a.createdAt, results: a.results, level: a.level })),
    growth: engine.fitnessGrowth(baseline, latest),
  };
}

function createApp(kv) {
  const SECRET = process.env.APP_SECRET || 'dev-secret-change-me';
  const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
  const saveUser = (u) => kv.set(K.user(u.id), u);
  // Express 4 doesn't catch rejected promises on its own
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '200kb' }));
  const api = express.Router();

  const auth = h(async (req, res, next) => {
    const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    const tokenHash = hmac(token);
    const s = await kv.get(K.session(tokenHash));
    if (!s || s.expiresAt < Date.now()) return res.status(401).json({ error: 'Session expired' });
    const user = await kv.get(K.user(s.userId));
    if (!user) return res.status(401).json({ error: 'Account not found' });
    req.user = user;
    req.tokenHash = tokenHash;
    next();
  });

  // Best-effort per-IP limit for OTP requests
  const ipHits = new Map();
  function rateLimit(req, res, next) {
    const now = Date.now();
    const hits = (ipHits.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (hits.length >= 10) return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' });
    hits.push(now);
    ipHits.set(req.ip, hits);
    next();
  }

  // =============== HEALTH (open /api/health in a browser to check the deployment) ===============
  api.get('/health', h(async (req, res) => {
    let storage = 'ok';
    try {
      await kv.set('health/check', { at: Date.now() });
      const back = await kv.get('health/check');
      if (!back) storage = 'error: wrote a test value but could not read it back';
    } catch (err) {
      storage = `error: ${err.message}`;
    }
    res.json({
      ok: storage === 'ok',
      storage,
      email: process.env.SMTP_USER && process.env.SMTP_PASS ? 'configured' : 'NOT configured (set SMTP_USER and SMTP_PASS)',
      appSecret: process.env.APP_SECRET ? 'set' : 'NOT set (using insecure default)',
    });
  }));

  // =============== AUTH ===============
  api.post('/auth/request-otp', rateLimit, h(async (req, res) => {
    const name = clean(req.body.name, 60);
    const email = clean(req.body.email, 120).toLowerCase();
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your name' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });

    const existing = await kv.get(K.otp(email));
    if (existing && Date.now() - existing.sentAt < OTP_RESEND_MS) {
      const wait = Math.ceil((OTP_RESEND_MS - (Date.now() - existing.sentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting a new code`, wait });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await kv.set(K.otp(email), { codeHash: hmac(email + ':' + code), sentAt: Date.now(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    try {
      const r = await sendOtpEmail(email, name, code);
      res.json({ ok: true, devMode: r.dev, resendIn: OTP_RESEND_MS / 1000 });
    } catch (err) {
      console.error('Email send failed:', err.message);
      await kv.delete(K.otp(email));
      res.status(500).json({ error: `Could not send the email (${err.message}).` });
    }
  }));

  api.post('/auth/verify-otp', h(async (req, res) => {
    const email = clean(req.body.email, 120).toLowerCase();
    const code = clean(req.body.code, 6);
    const name = clean(req.body.name, 60);
    const otp = await kv.get(K.otp(email));
    if (!otp || otp.expiresAt < Date.now()) return res.status(400).json({ error: 'Code expired. Request a new one.' });
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });

    const a = Buffer.from(otp.codeHash);
    const b = Buffer.from(hmac(email + ':' + code));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      otp.attempts++;
      await kv.set(K.otp(email), otp);
      return res.status(400).json({ error: `Incorrect code. ${OTP_MAX_ATTEMPTS - otp.attempts} attempts left.` });
    }
    await kv.delete(K.otp(email));

    const idx = await kv.get(K.email(email));
    let user = idx ? await kv.get(K.user(idx.userId)) : null;
    if (!user) {
      user = {
        id: uid(), name: name || email.split('@')[0], email, createdAt: Date.now(), onboarded: false,
        campus: '', xp: 0,
        profile: { fitnessLevel: 'beginner', goal: 'general', equipment: [], environment: 'room', levelSource: 'default' },
        missions: [], activities: [], assessments: [],
      };
      await saveUser(user);
      await kv.set(K.email(email), { userId: user.id });
    } else if (name && !user.onboarded) {
      user.name = name;
      await saveUser(user);
    }

    const token = crypto.randomBytes(32).toString('hex');
    await kv.set(K.session(hmac(token)), { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
    res.json({ token, user: publicUser(user) });
  }));

  api.post('/auth/logout', auth, h(async (req, res) => {
    await kv.delete(K.session(req.tokenHash));
    res.json({ ok: true });
  }));

  // =============== PROFILE ===============
  api.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

  api.put('/me/onboarding', auth, h(async (req, res) => {
    const u = req.user;
    const age = Number(req.body.age);
    if (!Number.isInteger(age) || age < 10 || age > 100) return res.status(400).json({ error: 'Please enter a valid age (10–100)' });
    u.age = age;
    u.medical = cleanMedical(req.body.medical || {});
    u.sports = cleanSports(req.body.sports || {});
    // Students who already play a sport start one step higher until their AI baseline says otherwise
    if (u.profile.levelSource === 'default') u.profile.fitnessLevel = u.sports.plays && !u.medical.has ? 'intermediate' : 'beginner';
    u.onboarded = true;
    await saveUser(u);
    res.json({ user: publicUser(u) });
  }));

  api.put('/me/context', auth, h(async (req, res) => {
    const u = req.user;
    const b = req.body;
    if (engine.LEVELS.includes(b.fitnessLevel)) { u.profile.fitnessLevel = b.fitnessLevel; u.profile.levelSource = 'manual'; }
    if (engine.GOALS.includes(b.goal)) u.profile.goal = b.goal;
    if (engine.ENVIRONMENTS.includes(b.environment)) u.profile.environment = b.environment;
    if (Array.isArray(b.equipment)) u.profile.equipment = b.equipment.filter((e) => engine.EQUIPMENT.includes(e));
    if (typeof b.name === 'string' && clean(b.name).length >= 2) u.name = clean(b.name, 60);
    if (b.medical) u.medical = cleanMedical(b.medical);
    if (b.sports) u.sports = cleanSports(b.sports);
    if (typeof b.campus === 'string' && campusKey(b.campus) !== campusKey(u.campus)) {
      if (u.campus) await kv.delete(K.campusPrefix(u.campus) + u.id);
      u.campus = clean(b.campus, 80);
      if (u.campus) await kv.set(K.campusPrefix(u.campus) + u.id, { joinedAt: Date.now() });
    }
    await saveUser(u);
    res.json({ user: publicUser(u) });
  }));

  // =============== STATS ===============
  api.get('/stats', auth, (req, res) => res.json(computeStats(req.user, tzOffset(req))));

  // =============== MISSIONS (AI Engine 2: Activity Intelligence) ===============
  api.post('/missions/generate', auth, h(async (req, res) => {
    const u = req.user;
    const stats = computeStats(u, tzOffset(req));
    const mission = engine.generateMission(u, {
      minutes: req.body.minutes,
      environment: req.body.environment || u.profile.environment,
      equipment: req.body.equipment || u.profile.equipment,
    }, { comeback: stats.comeback, inactiveDays: stats.inactiveDays });
    const record = { id: uid(), createdAt: Date.now(), status: 'pending', ...mission };
    // Keep only recent missions on the record
    u.missions = [...(u.missions || []).filter((m) => Date.now() - m.createdAt < DAY_MS), record].slice(-10);
    await saveUser(u);
    res.json({ mission: record, inactiveDays: stats.inactiveDays });
  }));

  api.post('/missions/:id/complete', auth, h(async (req, res) => {
    const u = req.user;
    const mission = (u.missions || []).find((m) => m.id === req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found or expired' });
    if (mission.status !== 'pending') return res.status(400).json({ error: 'Mission already completed' });
    const results = Array.isArray(req.body.results) ? req.body.results : [];

    const offset = tzOffset(req);
    const before = computeStats(u, offset);
    const firstToday = before.today.missions === 0;
    const streakAfter = firstToday ? before.streak + 1 : before.streak;

    const score = engine.scoreMission(mission, results, { firstToday, streakAfter });
    if (score.doneCount === 0) return res.status(400).json({ error: 'Complete at least one move to finish the mission' });

    mission.status = 'completed';
    u.activities = u.activities || [];
    u.activities.push({
      id: uid(), missionId: mission.id, title: mission.title, minutes: mission.minutes,
      environment: mission.environment, comeback: mission.comeback,
      xp: score.xp, activeMin: score.activeMin, verifiedCount: score.verifiedCount, doneCount: score.doneCount,
      completedAt: Date.now(),
    });
    u.xp = (u.xp || 0) + score.xp;
    await saveUser(u);
    res.json({ reward: score, stats: computeStats(u, offset) });
  }));

  // =============== ASSESSMENT (AI Engine 1: Fitness Assessment) ===============
  api.post('/assessments', auth, h(async (req, res) => {
    const u = req.user;
    const input = req.body.results || {};
    const results = {};
    const verified = {};
    for (const t of engine.TESTS) {
      const v = Number(input[t.key]);
      if (input[t.key] !== undefined && input[t.key] !== null && Number.isFinite(v) && v >= 0 && v <= 1000) results[t.key] = Math.round(v);
      verified[t.key] = Boolean(req.body.verified?.[t.key]);
    }
    if (!Object.keys(results).length) return res.status(400).json({ error: 'No results to save' });

    const prior = [...(u.assessments || [])].sort((a, b) => a.createdAt - b.createdAt);
    const level = engine.levelFromAssessment(results);
    const record = { id: uid(), createdAt: Date.now(), results, verified, level };
    u.assessments = [...prior, record];

    let xp = 40;
    const breakdown = [{ label: prior.length ? 'Re-assessment' : 'AI baseline set', xp: 40 }];
    const growth = prior.length ? engine.fitnessGrowth(prior[prior.length - 1], record) : null;
    if (growth && growth.fgi > 0) {
      const bonus = Math.min(100, growth.fgi);
      xp += bonus;
      breakdown.push({ label: `Improved ${growth.fgi}% since last test`, xp: bonus });
    }
    u.xp = (u.xp || 0) + xp;
    // A fresh assessment is the best signal, so it always resets the level (students can still override it later)
    u.profile.fitnessLevel = level;
    u.profile.levelSource = 'assessment';
    await saveUser(u);
    res.json({ assessment: record, level, reward: { xp, breakdown }, user: publicUser(u) });
  }));

  // =============== CAMPUS CHALLENGE (collective, no rankings) ===============
  api.get('/campus', auth, h(async (req, res) => {
    const u = req.user;
    if (!campusKey(u.campus)) return res.json({ campus: null });
    const offset = tzOffset(req);
    const today = dayKey(Date.now(), offset);
    const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7; // week starts Monday
    const weekStart = shiftDay(today, -dow);

    const prefix = K.campusPrefix(u.campus);
    const ids = new Set((await kv.list(prefix)).map((k) => k.slice(prefix.length)));
    ids.add(u.id);
    const members = (await Promise.all([...ids].map((id) => (id === u.id ? u : kv.get(K.user(id))))))
      .filter((m) => m && campusKey(m.campus) === campusKey(u.campus));

    let totalMin = 0, missions = 0, activeMembers = 0, myMin = 0;
    for (const m of members) {
      const week = (m.activities || []).filter((a) => dayKey(a.completedAt, offset) >= weekStart);
      const min = week.reduce((s, a) => s + a.activeMin, 0);
      totalMin += min;
      missions += week.length;
      if (week.length) activeMembers++;
      if (m.id === u.id) myMin = min;
    }

    res.json({
      campus: u.campus, weekStart,
      members: members.length, activeMembers,
      totalMin: Math.round(totalMin), goalMin: Math.max(60, members.length * 60),
      missions, myMin: Math.round(myMin * 10) / 10,
    });
  }));

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Local server uses /api; on Netlify the function may also see its own path
  app.use('/api', api);
  app.use('/.netlify/functions/api', api);

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: `Server error: ${err.message || 'unknown'}` });
  });

  return app;
}

module.exports = { createApp };
