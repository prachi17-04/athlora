require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { sendOtpEmail, mailConfigured } = require('./mailer');
const engine = require('./engine');

const app = express();
app.use(express.json({ limit: '200kb' }));

const SECRET = process.env.APP_SECRET || 'dev-secret-change-me';
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const DAY_MS = 24 * 60 * 60 * 1000;

const id = () => crypto.randomUUID();
const hash = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, max = 80) => String(s ?? '').trim().slice(0, max);

// ---------- helpers: dates in the student's local timezone ----------
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

// ---------- auth middleware ----------
function auth(req, res, next) {
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const s = db.data.sessions.find((x) => x.tokenHash === hash(token));
  if (!s || s.expiresAt < Date.now()) return res.status(401).json({ error: 'Session expired' });
  const user = db.data.users.find((u) => u.id === s.userId);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  req.user = user;
  req.session = s;
  next();
}

// Simple in-memory rate limit per IP for OTP requests
const ipHits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const hits = (ipHits.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (hits.length >= 10) return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' });
  hits.push(now);
  ipHits.set(req.ip, hits);
  next();
}

// =============== AUTH ===============
app.post('/api/auth/request-otp', rateLimit, async (req, res) => {
  const name = clean(req.body.name, 60);
  const email = clean(req.body.email, 120).toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });

  const existing = db.data.otps.find((o) => o.email === email);
  if (existing && Date.now() - existing.sentAt < OTP_RESEND_MS) {
    const wait = Math.ceil((OTP_RESEND_MS - (Date.now() - existing.sentAt)) / 1000);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting a new code`, wait });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  db.data.otps = db.data.otps.filter((o) => o.email !== email && o.expiresAt > Date.now());
  db.data.otps.push({ email, codeHash: hash(email + ':' + code), sentAt: Date.now(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  db.save();

  try {
    const r = await sendOtpEmail(email, name, code);
    res.json({ ok: true, devMode: r.dev, resendIn: OTP_RESEND_MS / 1000 });
  } catch (err) {
    console.error('Email send failed:', err.message);
    db.data.otps = db.data.otps.filter((o) => o.email !== email);
    db.save();
    res.status(500).json({ error: 'Could not send the email. Check the SMTP settings on the server.' });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const code = clean(req.body.code, 6);
  const name = clean(req.body.name, 60);
  const otp = db.data.otps.find((o) => o.email === email);
  if (!otp || otp.expiresAt < Date.now()) return res.status(400).json({ error: 'Code expired. Request a new one.' });
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });

  const a = Buffer.from(otp.codeHash);
  const b = Buffer.from(hash(email + ':' + code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    otp.attempts++;
    db.save();
    return res.status(400).json({ error: `Incorrect code. ${OTP_MAX_ATTEMPTS - otp.attempts} attempts left.` });
  }
  db.data.otps = db.data.otps.filter((o) => o.email !== email);

  let user = db.data.users.find((u) => u.email === email);
  if (!user) {
    user = {
      id: id(), name: name || email.split('@')[0], email, createdAt: Date.now(), onboarded: false,
      campus: '', xp: 0,
      profile: { fitnessLevel: 'beginner', goal: 'general', equipment: [], environment: 'room', levelSource: 'default' },
    };
    db.data.users.push(user);
  } else if (name && !user.onboarded) {
    user.name = name;
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.data.sessions = db.data.sessions.filter((s) => s.expiresAt > Date.now());
  db.data.sessions.push({ tokenHash: hash(token), userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
  db.save();
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', auth, (req, res) => {
  db.data.sessions = db.data.sessions.filter((s) => s !== req.session);
  db.save();
  res.json({ ok: true });
});

// =============== PROFILE ===============
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.put('/api/me/onboarding', auth, (req, res) => {
  const u = req.user;
  const age = Number(req.body.age);
  if (!Number.isInteger(age) || age < 10 || age > 100) return res.status(400).json({ error: 'Please enter a valid age (10–100)' });

  const med = req.body.medical || {};
  const medical = {
    has: Boolean(med.has),
    conditions: Array.isArray(med.conditions) ? med.conditions.map((c) => clean(c, 40)).slice(0, 10) : [],
    notes: clean(med.notes, 300),
  };
  const sp = req.body.sports || {};
  const sports = {
    plays: Boolean(sp.plays),
    list: Array.isArray(sp.list) ? sp.list.map((s) => clean(s, 30)).filter(Boolean).slice(0, 10) : [],
  };

  u.age = age;
  u.medical = medical;
  u.sports = sports;
  // Students who already play a sport start one step higher until their AI baseline says otherwise
  if (u.profile.levelSource === 'default') u.profile.fitnessLevel = sports.plays && !medical.has ? 'intermediate' : 'beginner';
  u.onboarded = true;
  db.save();
  res.json({ user: publicUser(u) });
});

app.put('/api/me/context', auth, (req, res) => {
  const u = req.user;
  const b = req.body;
  if (engine.LEVELS.includes(b.fitnessLevel)) { u.profile.fitnessLevel = b.fitnessLevel; u.profile.levelSource = 'manual'; }
  if (engine.GOALS.includes(b.goal)) u.profile.goal = b.goal;
  if (engine.ENVIRONMENTS.includes(b.environment)) u.profile.environment = b.environment;
  if (Array.isArray(b.equipment)) u.profile.equipment = b.equipment.filter((e) => engine.EQUIPMENT.includes(e));
  if (typeof b.campus === 'string') u.campus = clean(b.campus, 80);
  if (typeof b.name === 'string' && clean(b.name).length >= 2) u.name = clean(b.name, 60);
  if (b.medical) {
    u.medical = {
      has: Boolean(b.medical.has),
      conditions: Array.isArray(b.medical.conditions) ? b.medical.conditions.map((c) => clean(c, 40)).slice(0, 10) : [],
      notes: clean(b.medical.notes, 300),
    };
  }
  if (b.sports) {
    u.sports = { plays: Boolean(b.sports.plays), list: (b.sports.list || []).map((s) => clean(s, 30)).filter(Boolean).slice(0, 10) };
  }
  db.save();
  res.json({ user: publicUser(u) });
});

// =============== STATS ===============
function computeStats(user, offset) {
  const now = Date.now();
  const today = dayKey(now, offset);
  const acts = db.data.activities.filter((a) => a.userId === user.id).sort((a, b) => a.completedAt - b.completedAt);
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
  const comeback = inactiveDays >= 2;

  const days = (n) => Array.from({ length: n }, (_, i) => {
    const k = shiftDay(today, i - n + 1);
    return { day: k, ...(byDay[k] || { missions: 0, activeMin: 0, xp: 0 }) };
  });

  const assessments = db.data.assessments.filter((a) => a.userId === user.id).sort((a, b) => a.createdAt - b.createdAt);
  const baseline = assessments[0] || null;
  const latest = assessments[assessments.length - 1] || null;
  const growth = engine.fitnessGrowth(baseline, latest);

  const xp = user.xp || 0;
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const levelFloor = 50 * (level - 1) ** 2;
  const levelCeil = 50 * level ** 2;

  const todayStats = byDay[today] || { missions: 0, activeMin: 0, xp: 0 };
  return {
    today: { ...todayStats, activeMin: Math.round(todayStats.activeMin * 10) / 10, goalMin: 10 },
    streak, bestStreak: best,
    comeback, inactiveDays, hasActivity: acts.length > 0,
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
    baseline, latest, assessments: assessments.map((a) => ({ id: a.id, createdAt: a.createdAt, results: a.results, level: a.level })),
    growth,
  };
}

app.get('/api/stats', auth, (req, res) => res.json(computeStats(req.user, tzOffset(req))));

// =============== MISSIONS (AI Engine 2: Activity Intelligence) ===============
app.post('/api/missions/generate', auth, (req, res) => {
  const stats = computeStats(req.user, tzOffset(req));
  const recent = { comeback: stats.comeback && req.body.allowComeback !== false, inactiveDays: stats.inactiveDays };
  const mission = engine.generateMission(req.user, {
    minutes: req.body.minutes,
    environment: req.body.environment || req.user.profile.environment,
    equipment: req.body.equipment || req.user.profile.equipment,
  }, recent);
  const record = { id: id(), userId: req.user.id, createdAt: Date.now(), status: 'pending', ...mission };
  // keep only the latest few pending missions per user
  db.data.missions = db.data.missions.filter((m) => !(m.userId === req.user.id && m.status === 'pending' && Date.now() - m.createdAt > DAY_MS));
  db.data.missions.push(record);
  db.save();
  res.json({ mission: record, inactiveDays: stats.inactiveDays });
});

app.post('/api/missions/:id/complete', auth, (req, res) => {
  const mission = db.data.missions.find((m) => m.id === req.params.id && m.userId === req.user.id);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });
  if (mission.status !== 'pending') return res.status(400).json({ error: 'Mission already completed' });
  const results = Array.isArray(req.body.results) ? req.body.results : [];

  const offset = tzOffset(req);
  const before = computeStats(req.user, offset);
  const firstToday = before.today.missions === 0;
  const streakAfter = firstToday ? before.streak + 1 : before.streak;

  const score = engine.scoreMission(mission, results, { firstToday, streakAfter });
  if (score.doneCount === 0) return res.status(400).json({ error: 'Complete at least one move to finish the mission' });

  mission.status = 'completed';
  db.data.activities.push({
    id: id(), userId: req.user.id, missionId: mission.id, title: mission.title, minutes: mission.minutes,
    environment: mission.environment, comeback: mission.comeback,
    xp: score.xp, activeMin: score.activeMin, verifiedCount: score.verifiedCount, doneCount: score.doneCount,
    items: mission.items.map((it, i) => ({ name: it.name, target: it.target, unit: it.unit, ...(results[i] || {}) })),
    completedAt: Date.now(),
  });
  req.user.xp = (req.user.xp || 0) + score.xp;
  db.save();
  res.json({ reward: score, stats: computeStats(req.user, offset) });
});

// =============== ASSESSMENT (AI Engine 1: Fitness Assessment) ===============
app.post('/api/assessments', auth, (req, res) => {
  const input = req.body.results || {};
  const results = {};
  const verified = {};
  for (const t of engine.TESTS) {
    const v = Number(input[t.key]);
    if (Number.isFinite(v) && v >= 0 && v <= 1000) results[t.key] = Math.round(v);
    verified[t.key] = Boolean(req.body.verified?.[t.key]);
  }
  if (!Object.keys(results).length) return res.status(400).json({ error: 'No results to save' });

  const prior = db.data.assessments.filter((a) => a.userId === req.user.id).sort((a, b) => a.createdAt - b.createdAt);
  const level = engine.levelFromAssessment(results);
  const record = { id: id(), userId: req.user.id, createdAt: Date.now(), results, verified, level };
  db.data.assessments.push(record);

  let xp = 40;
  const breakdown = [{ label: prior.length ? 'Re-assessment' : 'AI baseline set', xp: 40 }];
  const growth = prior.length ? engine.fitnessGrowth(prior[prior.length - 1], record) : null;
  if (growth && growth.fgi > 0) {
    const bonus = Math.min(100, growth.fgi);
    xp += bonus;
    breakdown.push({ label: `Improved ${growth.fgi}% since last test`, xp: bonus });
  }
  req.user.xp = (req.user.xp || 0) + xp;
  // A fresh assessment is the best signal, so it always resets the level (students can still override it later)
  req.user.profile.fitnessLevel = level;
  req.user.profile.levelSource = 'assessment';
  db.save();
  res.json({ assessment: record, level, reward: { xp, breakdown }, user: publicUser(req.user) });
});

// =============== CAMPUS CHALLENGE (collective, no rankings) ===============
app.get('/api/campus', auth, (req, res) => {
  const key = (req.user.campus || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return res.json({ campus: null });
  const offset = tzOffset(req);
  const today = dayKey(Date.now(), offset);
  // Week starts Monday
  const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const weekStart = shiftDay(today, -dow);

  const members = db.data.users.filter((u) => (u.campus || '').toLowerCase().replace(/\s+/g, ' ').trim() === key);
  const memberIds = new Set(members.map((m) => m.id));
  const weekActs = db.data.activities.filter((a) => memberIds.has(a.userId) && dayKey(a.completedAt, offset) >= weekStart);
  const totalMin = weekActs.reduce((s, a) => s + a.activeMin, 0);
  const mine = weekActs.filter((a) => a.userId === req.user.id).reduce((s, a) => s + a.activeMin, 0);
  const activeMembers = new Set(weekActs.map((a) => a.userId)).size;

  res.json({
    campus: req.user.campus,
    weekStart,
    members: members.length,
    activeMembers,
    totalMin: Math.round(totalMin),
    goalMin: Math.max(60, members.length * 60),
    missions: weekActs.length,
    myMin: Math.round(mine * 10) / 10,
  });
});

// =============== STATIC APP ===============
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`\nATHLORA running at http://localhost:${PORT}`);
  console.log(mailConfigured ? 'Email: SMTP configured - OTPs will be emailed.' : 'Email: DEV MODE - OTPs will be printed here.');
});

process.on('SIGINT', () => { db.flushSync(); process.exit(0); });
