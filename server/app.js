// The ATHLORA API as an Express app. Used by both the local server (server/index.js)
// and the Netlify Function (netlify/functions/api.js).
const crypto = require('crypto');
const express = require('express');
const engine = require('./engine');
const { databaseEnvNames } = require('./kv');
const QRCode = require('qrcode');

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
    timetable: u.timetable || { dayStart: '08:00', dayEnd: '18:00', classes: [] },
    buddyCount: (u.buddies || (u.buddy ? [u.buddy] : [])).length,
  };
}

// Local weekday (Sun=0) and minute-of-day for the student's timezone
function localNow(offset, ts = Date.now()) {
  const d = new Date(ts - offset * 60000);
  return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

// A student's buddy list; upgrades records from the old single-buddy format in place
function buddiesOf(u) {
  if (!Array.isArray(u.buddies)) u.buddies = u.buddy ? [u.buddy] : [];
  delete u.buddy;
  return u.buddies;
}

const firstName = (u) => String(u.name || '').split(' ')[0];

function movedOn(user, day, offset) {
  return (user.activities || []).some((a) => dayKey(a.completedAt, offset) === day);
}

// Consecutive days (ending today, or yesterday) on which BOTH students completed a mission
function sharedStreak(a, b, offset) {
  const today = dayKey(Date.now(), offset);
  const days = (u) => new Set((u.activities || []).map((x) => dayKey(x.completedAt, offset)));
  const da = days(a), db = days(b);
  const both = (k) => da.has(k) && db.has(k);
  let cursor = both(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (both(cursor)) { n++; cursor = shiftDay(cursor, -1); }
  return n;
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
  const recentForm = acts.filter((a) => typeof a.formAvg === 'number' && now - a.completedAt < 14 * DAY_MS);
  const study = user.studySessions || [];
  const studyMin = study.reduce((s, x) => s + x.minutes, 0);
  return {
    adaptiveTargets: engine.personalTargets(user),
    study: {
      sessions: study.length,
      minutes: Math.round(studyMin),
      // time-weighted share of study time spent in good posture
      goodPct: studyMin ? Math.round(study.reduce((s, x) => s + x.goodPct * x.minutes, 0) / studyMin) : null,
      breaksTaken: study.reduce((s, x) => s + x.breaksTaken, 0),
      recent: study.slice(-5).reverse(),
    },
    certificates: (user.certificates || []).slice(-5).reverse(),
    form: {
      avg14: recentForm.length ? Math.round(recentForm.reduce((s, a) => s + a.formAvg, 0) / recentForm.length) : null,
      missions: recentForm.length,
    },
    fitIndia: latest ? engine.fitIndiaReport(latest.results) : null,
    fitIndiaBaseline: baseline && latest && baseline !== latest ? engine.fitIndiaReport(baseline.results) : null,
    today: { ...todayStats, activeMin: Math.round(todayStats.activeMin * 10) / 10, goalMin: 10 },
    streak, bestStreak: best,
    comeback: inactiveDays >= 2, inactiveDays, hasActivity: acts.length > 0,
    xp, level, levelProgress: (xp - levelFloor) / (levelCeil - levelFloor), nextLevelXp: levelCeil,
    week: days(7), last14: days(14),
    totals: {
      missions: acts.length,
      activeMin: Math.round(acts.reduce((s, a) => s + a.activeMin, 0)),
      verifiedMoves: acts.reduce((s, a) => s + a.verifiedCount, 0),
      steps: acts.reduce((s, a) => s + (a.steps || 0), 0),
      classBreaks: acts.filter((a) => a.classBreak).length,
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

  // Best-effort per-IP limit for sign-ins
  const ipHits = new Map();
  function rateLimit(req, res, next) {
    const now = Date.now();
    const hits = (ipHits.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (hits.length >= 30) return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' });
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
      appSecret: process.env.APP_SECRET ? 'set' : 'NOT set (using insecure default)',
      // Names only (never values): helps diagnose a database that isn't connected
      databaseEnv: storage === 'ok' ? undefined : databaseEnvNames(),
    });
  }));

  // =============== AUTH (name + email, no verification code) ===============
  api.post('/auth/login', rateLimit, h(async (req, res) => {
    const name = clean(req.body.name, 60);
    const email = clean(req.body.email, 120).toLowerCase();
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your name' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });

    const idx = await kv.get(K.email(email));
    let user = idx ? await kv.get(K.user(idx.userId)) : null;
    if (!user) {
      user = {
        id: uid(), name, email, createdAt: Date.now(), onboarded: false,
        campus: '', xp: 0,
        profile: { fitnessLevel: 'beginner', goal: 'general', equipment: [], environment: 'room', levelSource: 'default' },
        missions: [], activities: [], assessments: [],
      };
      await saveUser(user);
      await kv.set(K.email(email), { userId: user.id });
    } else if (!user.onboarded) {
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
    if (typeof b.adaptive === 'boolean') u.profile.adaptive = b.adaptive;
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

  // =============== HEALTH-SAFE PLAN ===============
  // What a student with a reported condition should (and shouldn't) do. General guidance, not a diagnosis.
  api.get('/health-plan', auth, (req, res) => res.json(engine.healthPlan(req.user)));

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

    const buddies = await Promise.all(buddiesOf(u).map((b) => kv.get(K.user(b.userId))));
    const todayKey = dayKey(Date.now(), offset);
    const buddiesMovedToday = buddies.filter((b) => b && movedOn(b, todayKey, offset)).length;

    const score = engine.scoreMission(mission, results, { firstToday, streakAfter, buddiesMovedToday });
    if (score.doneCount === 0) return res.status(400).json({ error: 'Complete at least one move to finish the mission' });

    mission.status = 'completed';
    // Adaptive difficulty: learn from this mission's verified results
    const adaptations = engine.adaptTargets(u, mission, results);
    // Steps counted by the phone's motion sensors on walking / stairs moves
    const steps = results.reduce((s, r, i) => s + (mission.items[i]?.sensor && r?.done && r.verified ? Math.min(20000, Math.max(0, Math.round(Number(r.steps) || 0))) : 0), 0);
    u.activities = u.activities || [];
    u.activities.push({
      id: uid(), missionId: mission.id, title: mission.title, minutes: mission.minutes,
      environment: mission.environment, comeback: mission.comeback,
      xp: score.xp, activeMin: score.activeMin, verifiedCount: score.verifiedCount, doneCount: score.doneCount,
      formAvg: score.formAvg, steps,
      completedAt: Date.now(),
    });
    u.xp = (u.xp || 0) + score.xp;
    await saveUser(u);
    res.json({ reward: { ...score, steps }, adaptations, stats: computeStats(u, offset) });
  }));

  // =============== ASSESSMENT (AI Engine 1: Fitness Assessment) ===============
  api.post('/assessments', auth, h(async (req, res) => {
    const u = req.user;
    const input = req.body.results || {};
    const results = {};
    const verified = {};
    // The AI assessment is camera-only: results count only when the camera verified them
    for (const t of engine.TESTS) {
      const v = Number(input[t.key]);
      if (!req.body.verified?.[t.key]) continue;
      if (input[t.key] !== undefined && input[t.key] !== null && Number.isFinite(v) && v >= 0 && v <= 1000) {
        results[t.key] = Math.round(v);
        verified[t.key] = true;
      }
    }
    if (!Object.keys(results).length) return res.status(400).json({ error: 'No camera-verified results to save. Complete at least one test on camera.' });

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
    // A fresh assessment is the best signal, so it always resets the level (students can still override it later).
    // Learned targets are relative to the level, so a new level starts learning afresh.
    const recalibrated = u.profile.fitnessLevel !== level && Object.keys(u.adaptiveTargets || {}).length > 0;
    if (u.profile.fitnessLevel !== level) u.adaptiveTargets = {};
    u.profile.fitnessLevel = level;
    u.profile.levelSource = 'assessment';
    await saveUser(u);
    res.json({ assessment: record, level, recalibrated, reward: { xp, breakdown }, user: publicUser(u) });
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

  // =============== TIMETABLE-AWARE OPPORTUNITY ENGINE ===============
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  api.put('/me/timetable', auth, h(async (req, res) => {
    const b = req.body || {};
    const dayStart = HHMM.test(b.dayStart) ? b.dayStart : '08:00';
    const dayEnd = HHMM.test(b.dayEnd) ? b.dayEnd : '18:00';
    if (engine.toMin(dayEnd) <= engine.toMin(dayStart)) return res.status(400).json({ error: 'Day end must be after day start' });
    const classes = [];
    for (const c of Array.isArray(b.classes) ? b.classes.slice(0, 80) : []) {
      const day = Number(c.day);
      if (!Number.isInteger(day) || day < 0 || day > 6 || !HHMM.test(c.start) || !HHMM.test(c.end)) continue;
      if (engine.toMin(c.end) <= engine.toMin(c.start)) return res.status(400).json({ error: `"${clean(c.title, 40) || 'A class'}" ends before it starts` });
      classes.push({ id: clean(c.id, 40) || uid(), day, start: c.start, end: c.end, title: clean(c.title, 40) || 'Class' });
    }
    req.user.timetable = { dayStart, dayEnd, classes };
    await saveUser(req.user);
    res.json({ user: publicUser(req.user) });
  }));

  api.get('/opportunities', auth, (req, res) => {
    const u = req.user;
    const offset = tzOffset(req);
    const { day, min } = localNow(offset);
    const today = dayKey(Date.now(), offset);
    const completedMins = (u.activities || [])
      .filter((a) => dayKey(a.completedAt, offset) === today)
      .map((a) => localNow(offset, a.completedAt).min);
    const configured = Boolean(u.timetable?.classes?.length);
    const hasClassesToday = configured && u.timetable.classes.some((c) => c.day === day);
    res.json({
      configured, hasClassesToday, day, nowMin: min,
      items: configured ? engine.findOpportunities(u.timetable, day, min, completedMins) : [],
    });
  });

  // =============== MOVE BUDDIES (shared streaks, no comparison) ===============
  // Each student has one reusable invite code; any number of friends can use it.
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const MAX_BUDDIES = 100;

  async function ensureBuddyCode(u) {
    const existing = u.buddyCode && await kv.get(`buddycode/${u.buddyCode}`);
    if (existing?.userId === u.id) return u.buddyCode;
    let code;
    do {
      code = Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    } while (await kv.get(`buddycode/${code}`));
    await kv.set(`buddycode/${code}`, { userId: u.id });
    u.buddyCode = code;
    await saveUser(u);
    return code;
  }

  api.post('/buddy/join', auth, h(async (req, res) => {
    const u = req.user;
    const code = clean(req.body.code, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const entry = await kv.get(`buddycode/${code}`);
    if (!entry) return res.status(400).json({ error: "That code doesn't exist. Check it with your friend." });
    if (entry.userId === u.id) return res.status(400).json({ error: "That's your own code — share it with your friends" });
    const other = await kv.get(K.user(entry.userId));
    if (!other || other.buddyCode !== code) return res.status(400).json({ error: "That code doesn't exist. Check it with your friend." });
    const mine = buddiesOf(u), theirs = buddiesOf(other);
    if (mine.some((b) => b.userId === other.id)) return res.status(400).json({ error: `You're already buddies with ${firstName(other)}` });
    if (mine.length >= MAX_BUDDIES || theirs.length >= MAX_BUDDIES) return res.status(400).json({ error: `Buddy limit reached (${MAX_BUDDIES})` });
    const since = Date.now();
    mine.push({ userId: other.id, since });
    theirs.push({ userId: u.id, since });
    await saveUser(other);
    await saveUser(u);
    res.json({ ok: true, name: firstName(other) });
  }));

  api.get('/buddy', auth, h(async (req, res) => {
    const u = req.user;
    buddiesOf(u); // upgrade old single-buddy records before anything is saved
    const code = await ensureBuddyCode(u);
    const offset = tzOffset(req);
    const today = dayKey(Date.now(), offset);
    const others = await Promise.all(buddiesOf(u).map((b) => kv.get(K.user(b.userId))));
    // Only what a buddy needs: first name, moved today or not, the shared streak
    const buddies = buddiesOf(u)
      .map((b, i) => ({ b, other: others[i] }))
      .filter(({ other }) => other && buddiesOf(other).some((x) => x.userId === u.id))
      .map(({ b, other }) => ({
        id: other.id,
        name: firstName(other),
        movedToday: movedOn(other, today, offset),
        sharedStreak: sharedStreak(u, other, offset),
        since: b.since,
      }))
      .sort((a, b) => b.sharedStreak - a.sharedStreak || Number(b.movedToday) - Number(a.movedToday) || a.name.localeCompare(b.name));
    res.json({ code, meMovedToday: movedOn(u, today, offset), buddies });
  }));

  api.delete('/buddy/:id', auth, h(async (req, res) => {
    const u = req.user;
    const other = await kv.get(K.user(req.params.id));
    if (other) {
      other.buddies = buddiesOf(other).filter((b) => b.userId !== u.id);
      await saveUser(other);
    }
    u.buddies = buddiesOf(u).filter((b) => b.userId !== req.params.id);
    await saveUser(u);
    res.json({ ok: true });
  }));

  // =============== INSTITUTION DASHBOARD (anonymized, for PE departments) ===============
  const MIN_GROUP = 5; // never show breakdowns for fewer students than this
  const instKey = (campus) => `institution/${sha(campusKey(campus))}`;

  async function checkInstitution(req, res) {
    const campus = clean(req.body.campus, 80);
    const pin = String(req.body.pin || '');
    if (!campusKey(campus)) { res.status(400).json({ error: 'Enter the community name' }); return null; }
    const inst = await kv.get(instKey(campus));
    if (!inst) { res.status(404).json({ error: 'This community has no institution dashboard yet. Claim it first.' }); return null; }
    if (inst.pinHash !== hmac('inst:' + campusKey(campus) + ':' + pin)) { res.status(403).json({ error: 'Wrong PIN' }); return null; }
    return { campus, inst };
  }

  api.post('/institution/claim', rateLimit, h(async (req, res) => {
    const campus = clean(req.body.campus, 80);
    const pin = String(req.body.pin || '');
    if (!campusKey(campus)) return res.status(400).json({ error: 'Enter the community name' });
    if (pin.length < 6) return res.status(400).json({ error: 'Choose a PIN of at least 6 characters' });
    if (await kv.get(instKey(campus))) return res.status(409).json({ error: 'This community dashboard is already claimed. Ask your PE department for the PIN.' });
    await kv.set(instKey(campus), { name: campus, pinHash: hmac('inst:' + campusKey(campus) + ':' + pin), createdAt: Date.now() });
    res.json({ ok: true });
  }));

  api.post('/institution/stats', rateLimit, h(async (req, res) => {
    const ok = await checkInstitution(req, res);
    if (!ok) return;
    const offset = tzOffset(req);
    const now = Date.now();
    const today = dayKey(now, offset);
    const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const weekStart = shiftDay(today, -dow);

    const prefix = K.campusPrefix(ok.campus);
    const ids = (await kv.list(prefix)).map((k) => k.slice(prefix.length));
    const members = (await Promise.all(ids.map((id) => kv.get(K.user(id)))))
      .filter((m) => m && campusKey(m.campus) === campusKey(ok.campus));

    const base = { campus: ok.inst.name, members: members.length, minGroup: MIN_GROUP };
    if (members.length < MIN_GROUP) return res.json({ ...base, tooSmall: true });

    const acts28 = members.flatMap((m) => (m.activities || []).filter((a) => now - a.completedAt < 28 * DAY_MS));
    const weekActs = acts28.filter((a) => dayKey(a.completedAt, offset) >= weekStart);
    const activeThisWeek = new Set(members.filter((m) => (m.activities || []).some((a) => dayKey(a.completedAt, offset) >= weekStart)).map((m) => m.id));

    // 4-week trend (oldest first)
    const trend = [3, 2, 1, 0].map((w) => {
      const from = shiftDay(weekStart, -7 * w);
      const to = shiftDay(from, 7);
      const acts = members.flatMap((m) => (m.activities || []).filter((a) => { const k = dayKey(a.completedAt, offset); return k >= from && k < to; }));
      return { weekStart: from, activeMin: Math.round(acts.reduce((s, a) => s + a.activeMin, 0)), missions: acts.length };
    });

    // When students move: weekday (Mon=0) x 3-hour slot from 06:00, last 28 days
    const SLOTS = ['06–09', '09–12', '12–15', '15–18', '18–21', '21–24'];
    const heat = Array.from({ length: 7 }, () => Array(SLOTS.length).fill(0));
    for (const a of acts28) {
      const { day, min } = localNow(offset, a.completedAt);
      const slot = Math.floor(min / 180) - 2;
      if (slot >= 0 && slot < SLOTS.length) heat[(day + 6) % 7][slot]++;
    }

    const envCounts = {};
    for (const a of acts28) envCounts[a.environment] = (envCounts[a.environment] || 0) + 1;
    const levels = { beginner: 0, intermediate: 0, advanced: 0 };
    for (const m of members) if (levels[m.profile?.fitnessLevel] !== undefined) levels[m.profile.fitnessLevel]++;

    const growths = members.map((m) => {
      const as = [...(m.assessments || [])].sort((a, b) => a.createdAt - b.createdAt);
      return as.length >= 2 ? engine.fitnessGrowth(as[0], as[as.length - 1]) : null;
    }).filter(Boolean);

    const fitIndia = engine.FIT_INDIA_COMPONENTS.map((c) => {
      const scores = members.map((m) => {
        const as = [...(m.assessments || [])].sort((a, b) => a.createdAt - b.createdAt);
        const rep = as.length ? engine.fitIndiaReport(as[as.length - 1].results) : null;
        return rep?.find((r) => r.key === c.key && r.measured)?.score;
      }).filter((s) => typeof s === 'number');
      return { key: c.key, label: c.label, students: scores.length, avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
    });

    const verifiedMoves = acts28.reduce((s, a) => s + (a.verifiedCount || 0), 0);
    const doneMoves = acts28.reduce((s, a) => s + (a.doneCount || 0), 0);
    const forms = acts28.filter((a) => typeof a.formAvg === 'number');

    // Rule-based suggestions for the PE department
    const insights = [];
    const inactiveShare = Math.round(((members.length - activeThisWeek.size) / members.length) * 100);
    if (inactiveShare >= 30) insights.push(`${inactiveShare}% of students haven't moved with ATHLORA this week. A short campus challenge or class-time movement break could re-engage them.`);
    let low = null;
    for (let d = 0; d < 5; d++) for (let s = 1; s <= 3; s++) if (!low || heat[d][s] < low.v) low = { d, s, v: heat[d][s] };
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (low && acts28.length >= 10) insights.push(`Least movement on weekdays: ${DAYS[low.d]} ${SLOTS[low.s]}. That's a good slot for a scheduled walk or stretch break.`);
    const measured = fitIndia.filter((c) => c.avg !== null && c.students >= MIN_GROUP);
    if (measured.length) {
      const weakest = measured.reduce((a, b) => (b.avg < a.avg ? b : a));
      insights.push(`Weakest Fit India component across students: ${weakest.label} (avg ${weakest.avg}/100). Consider focusing PE sessions on it.`);
    }
    if (forms.length >= 10) {
      const avgForm = Math.round(forms.reduce((s, a) => s + a.formAvg, 0) / forms.length);
      if (avgForm < 70) insights.push(`Average exercise form is ${avgForm}/100. A short technique session on squats and push-ups would help.`);
    }

    res.json({
      ...base,
      tooSmall: false,
      week: {
        start: weekStart,
        activeStudents: activeThisWeek.size,
        activeShare: Math.round((activeThisWeek.size / members.length) * 100),
        avgMinPerStudent: Math.round((weekActs.reduce((s, a) => s + a.activeMin, 0) / members.length) * 10) / 10,
        missions: weekActs.length,
      },
      last28: {
        missions: acts28.length,
        verifiedShare: doneMoves ? Math.round((verifiedMoves / doneMoves) * 100) : 0,
        avgForm: forms.length ? Math.round(forms.reduce((s, a) => s + a.formAvg, 0) / forms.length) : null,
        comebacks: acts28.filter((a) => a.comeback).length,
        environments: envCounts,
      },
      trend, heat: { slots: SLOTS, rows: heat },
      levels,
      growth: growths.length >= MIN_GROUP
        ? { students: growths.length, avgFgi: Math.round(growths.reduce((s, g) => s + g.fgi, 0) / growths.length) }
        : { students: growths.length, avgFgi: null },
      fitIndia: fitIndia.map((c) => (c.students >= MIN_GROUP ? c : { ...c, avg: null })),
      insights,
    });
  }));

  // =============== POSTURE GUARDIAN (study sessions) ===============
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  api.post('/study-sessions', auth, h(async (req, res) => {
    const u = req.user;
    const minutes = Number(req.body.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) return res.status(400).json({ error: 'Study for at least a minute to save a session' });
    const session = {
      at: Date.now(),
      minutes: Math.round(minutes * 10) / 10,
      goodPct: clampInt(req.body.goodPct, 0, 100),
      alerts: clampInt(req.body.alerts, 0, 1000),
      breaksTaken: clampInt(req.body.breaksTaken, 0, 50),
    };
    let xp = 0;
    const breakdown = [];
    if (minutes >= 10) {
      const base = Math.min(20, Math.floor(minutes / 10) * 5);
      xp += base;
      breakdown.push({ label: 'Studied with Posture Guardian', xp: base });
      if (session.goodPct >= 70) { xp += 5; breakdown.push({ label: 'Good posture 70%+ of the time', xp: 5 }); }
    }
    u.studySessions = [...(u.studySessions || []), session].slice(-200);
    u.xp = (u.xp || 0) + xp;
    await saveUser(u);
    res.json({ reward: { xp, breakdown }, stats: computeStats(u, tzOffset(req)) });
  }));

  // =============== TEACHER-LED CLASS MOVEMENT BREAK ===============
  // Projector screen + phones stay in sync by computing the current move from a shared server start time.
  const breakKey = (code) => `break/${code}`;
  const normCode = (c) => clean(c, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const totalSec = (b) => b.moves.reduce((s, m) => s + m.sec, 0);
  function breakStatus(b, now = Date.now()) {
    if (b.endedAt) return 'ended';
    if (now > b.expiresAt) return 'expired';
    if (!b.startedAt) return 'lobby';
    if (now < b.startedAt) return 'starting';
    if (now > b.startedAt + totalSec(b) * 1000) return 'ended';
    return 'running';
  }
  async function breakView(b) {
    const [joined, done] = await Promise.all([kv.list(`breakp/${b.code}/`), kv.list(`breakdone/${b.code}/`)]);
    return {
      code: b.code, title: b.title, hostName: b.hostName, minutes: b.minutes, seated: b.seated, moves: b.moves,
      totalSec: totalSec(b), status: breakStatus(b), startedAt: b.startedAt, serverNow: Date.now(),
      participants: joined.length, completed: done.length,
    };
  }
  async function loadBreak(req, res) {
    const b = await kv.get(breakKey(normCode(req.params.code)));
    if (!b) { res.status(404).json({ error: 'No class break with that code' }); return null; }
    return b;
  }
  const isHost = (b, key) => typeof key === 'string' && key.length > 0 && b.hostKeyHash === hmac('break:' + key);

  api.post('/breaks', auth, h(async (req, res) => {
    const u = req.user;
    const minutes = [2, 3, 5].includes(Number(req.body.minutes)) ? Number(req.body.minutes) : 2;
    const seated = Boolean(req.body.seated);
    let code;
    do { code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); }
    while (await kv.get(breakKey(code)));
    const hostKey = crypto.randomBytes(12).toString('hex');
    const now = Date.now();
    await kv.set(breakKey(code), {
      code, hostId: u.id, hostName: firstName(u), hostKeyHash: hmac('break:' + hostKey),
      title: clean(req.body.title, 60) || 'Class movement break', minutes, seated,
      moves: engine.classBreakRoutine(minutes, seated),
      createdAt: now, expiresAt: now + 6 * 3600 * 1000, startedAt: null, endedAt: null,
    });
    res.json({ code, hostKey });
  }));

  api.get('/breaks/:code', h(async (req, res) => {
    const b = await loadBreak(req, res);
    if (b) res.json(await breakView(b));
  }));

  api.post('/breaks/:code/start', h(async (req, res) => {
    const b = await loadBreak(req, res);
    if (!b) return;
    if (!isHost(b, req.body.hostKey)) return res.status(403).json({ error: 'Only the teacher who created this break can start it' });
    if (['expired'].includes(breakStatus(b))) return res.status(400).json({ error: 'This break has expired. Create a new one.' });
    b.startedAt = Date.now() + 5000; // 5-second "get ready" countdown on every screen
    b.endedAt = null;
    await kv.set(breakKey(b.code), b);
    res.json(await breakView(b));
  }));

  api.post('/breaks/:code/end', h(async (req, res) => {
    const b = await loadBreak(req, res);
    if (!b) return;
    if (!isHost(b, req.body.hostKey)) return res.status(403).json({ error: 'Only the teacher who created this break can end it' });
    b.endedAt = Date.now();
    await kv.set(breakKey(b.code), b);
    res.json(await breakView(b));
  }));

  api.post('/breaks/:code/join', auth, h(async (req, res) => {
    const b = await loadBreak(req, res);
    if (!b) return;
    const status = breakStatus(b);
    if (status === 'ended' || status === 'expired') return res.status(400).json({ error: 'This class break has already finished' });
    await kv.set(`breakp/${b.code}/${req.user.id}`, { at: Date.now() });
    res.json({ ...(await breakView(b)), joined: true });
  }));

  api.post('/breaks/:code/complete', auth, h(async (req, res) => {
    const u = req.user;
    const b = await loadBreak(req, res);
    if (!b) return;
    if (!(await kv.get(`breakp/${b.code}/${u.id}`))) return res.status(400).json({ error: 'Join the break first' });
    if (await kv.get(`breakdone/${b.code}/${u.id}`)) return res.status(400).json({ error: 'Already completed' });
    // Must have followed most of the routine: can't claim it before 80% of the time has passed
    if (!b.startedAt || Date.now() < b.startedAt + totalSec(b) * 800) return res.status(400).json({ error: 'The break is still running — follow along to the end' });

    const offset = tzOffset(req);
    const before = computeStats(u, offset);
    const firstToday = before.today.missions === 0;
    const streakAfter = firstToday ? before.streak + 1 : before.streak;
    let xp = 15;
    const breakdown = [{ label: 'Class movement break', xp: 15 }];
    if (firstToday && streakAfter > 1) {
      const bonus = 2 * Math.min(streakAfter, 10);
      xp += bonus;
      breakdown.push({ label: `${streakAfter}-day consistency`, xp: bonus });
    }
    const activeMin = Math.round((totalSec(b) / 60) * 10) / 10;
    u.activities = [...(u.activities || []), {
      id: uid(), title: `CLASS BREAK · ${b.title}`, minutes: b.minutes, environment: 'classroom', comeback: false,
      classBreak: true, xp, activeMin, verifiedCount: 0, doneCount: b.moves.length, formAvg: null, steps: 0, completedAt: Date.now(),
    }];
    u.xp = (u.xp || 0) + xp;
    await kv.set(`breakdone/${b.code}/${u.id}`, { at: Date.now() });
    await saveUser(u);
    res.json({ reward: { xp, breakdown, activeMin }, stats: computeStats(u, offset) });
  }));

  // =============== VERIFIABLE FITNESS PASSPORT CERTIFICATE ===============
  api.post('/certificates', auth, h(async (req, res) => {
    const u = req.user;
    const s = computeStats(u, tzOffset(req));
    if (!s.totals.missions && !s.baseline) return res.status(400).json({ error: 'Complete a Move Mission or your AI baseline first' });
    let id;
    do { id = Array.from({ length: 10 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); }
    while (await kv.get(`cert/${id}`));
    const cert = {
      id, issuedAt: Date.now(), name: u.name, memberSince: u.createdAt, community: u.campus || null,
      level: s.level, xp: s.xp, fitnessLevel: u.profile.fitnessLevel, seatedMode: Boolean(u.profile.adaptive),
      totals: s.totals, streak: s.streak, bestStreak: s.bestStreak,
      growth: s.growth ? { fgi: s.growth.fgi, tests: s.growth.perTest.length, since: s.baseline.createdAt } : null,
      fitIndia: s.fitIndia, formAvg14: s.form.avg14,
      study: { minutes: s.study.minutes, goodPct: s.study.goodPct },
      adaptive: s.adaptiveTargets.filter((t) => t.pct !== 0).slice(0, 4),
    };
    await kv.set(`cert/${id}`, cert);
    u.certificates = [...(u.certificates || []), { id, issuedAt: cert.issuedAt }].slice(-20);
    await saveUser(u);
    res.json({ id });
  }));

  // Public: anyone scanning the QR code can verify the certificate
  api.get('/certificates/:id', h(async (req, res) => {
    const cert = await kv.get(`cert/${normCode(req.params.id)}`);
    if (!cert) return res.status(404).json({ error: 'Certificate not found. It may be fake or mistyped.' });
    res.json(cert);
  }));

  // QR code image (SVG) for links shown on screen
  api.get('/qr', h(async (req, res) => {
    const data = clean(req.query.data, 400);
    if (!/^https?:\/\//.test(data)) return res.status(400).json({ error: 'data must be a link' });
    const svg = await QRCode.toString(data, { type: 'svg', margin: 1, color: { dark: '#07111f', light: '#ffffff' } });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
  }));

  // =============== INSTITUTION IMPACT REPORT (anonymous, exportable) ===============
  api.post('/institution/report', rateLimit, h(async (req, res) => {
    const ok = await checkInstitution(req, res);
    if (!ok) return;
    const offset = tzOffset(req);
    const now = Date.now();
    const prefix = K.campusPrefix(ok.campus);
    const ids = (await kv.list(prefix)).map((k) => k.slice(prefix.length));
    const members = (await Promise.all(ids.map((id) => kv.get(K.user(id)))))
      .filter((m) => m && campusKey(m.campus) === campusKey(ok.campus));
    const base = { campus: ok.inst.name, members: members.length, minGroup: MIN_GROUP, generatedAt: now };
    if (members.length < MIN_GROUP) return res.json({ ...base, tooSmall: true });

    const acts = members.flatMap((m) => (m.activities || []).map((a) => ({ ...a, uid: m.id })));
    if (!acts.length) return res.json({ ...base, noData: true });

    const mondayOf = (ts) => { const k = dayKey(ts, offset); return shiftDay(k, -((new Date(k + 'T00:00:00Z').getUTCDay() + 6) % 7)); };
    const pilotStart = Math.min(...acts.map((a) => a.completedAt));
    const weeks = [];
    for (let w = mondayOf(pilotStart); w <= mondayOf(now); w = shiftDay(w, 7)) weeks.push(w);
    const series = weeks.slice(-16).map((w) => {
      const end = shiftDay(w, 7);
      const wa = acts.filter((a) => { const k = dayKey(a.completedAt, offset); return k >= w && k < end; });
      const daysByStudent = {};
      for (const a of wa) (daysByStudent[a.uid] ||= new Set()).add(dayKey(a.completedAt, offset));
      const done = wa.reduce((s, a) => s + (a.doneCount || 0), 0);
      const activeMin = wa.reduce((s, a) => s + a.activeMin, 0);
      return {
        weekStart: w,
        activeStudents: Object.keys(daysByStudent).length,
        activeShare: Math.round((Object.keys(daysByStudent).length / members.length) * 100),
        regularShare: Math.round((Object.values(daysByStudent).filter((d) => d.size >= 3).length / members.length) * 100),
        activeMin: Math.round(activeMin),
        avgMinPerStudent: Math.round((activeMin / members.length) * 10) / 10,
        missions: wa.length,
        verifiedShare: done ? Math.round((wa.reduce((s, a) => s + (a.verifiedCount || 0), 0) / done) * 100) : 0,
        classBreaks: wa.filter((a) => a.classBreak).length,
      };
    });

    // Before vs after: first vs most recent weeks (2 each when there are 4+ weeks)
    let beforeAfter = null;
    if (series.length >= 2) {
      const n = series.length >= 4 ? 2 : 1;
      const avg = (rows, k) => Math.round((rows.reduce((s, r) => s + r[k], 0) / rows.length) * 10) / 10;
      const first = series.slice(0, n), last = series.slice(-n);
      beforeAfter = {
        weeksEach: n,
        metrics: [
          ['avgMinPerStudent', 'Active minutes per student per week'],
          ['activeShare', '% of students active in a week'],
          ['regularShare', '% moving 3+ days a week'],
        ].map(([k, label]) => ({ key: k, label, before: avg(first, k), after: avg(last, k) })),
      };
    }

    const sortedAssess = (m) => [...(m.assessments || [])].sort((a, b) => a.createdAt - b.createdAt);
    const retested = members.map(sortedAssess).filter((as) => as.length >= 2);
    const growths = retested.map((as) => engine.fitnessGrowth(as[0], as[as.length - 1])).filter(Boolean);
    const fitIndia = engine.FIT_INDIA_COMPONENTS.map((c) => {
      const pairs = retested.map((as) => {
        const b = engine.fitIndiaReport(as[0].results).find((x) => x.key === c.key);
        const l = engine.fitIndiaReport(as[as.length - 1].results).find((x) => x.key === c.key);
        return b.measured && l.measured ? [b.score, l.score] : null;
      }).filter(Boolean);
      if (pairs.length < MIN_GROUP) return { key: c.key, label: c.label, students: pairs.length, baseline: null, latest: null };
      const mean = (i) => Math.round(pairs.reduce((s, p) => s + p[i], 0) / pairs.length);
      return { key: c.key, label: c.label, students: pairs.length, baseline: mean(0), latest: mean(1) };
    });

    const done = acts.reduce((s, a) => s + (a.doneCount || 0), 0);
    const forms = acts.filter((a) => typeof a.formAvg === 'number');
    const study = members.flatMap((m) => m.studySessions || []);
    const studyMin = study.reduce((s, x) => s + x.minutes, 0);
    res.json({
      ...base,
      pilotStart,
      weeks: series,
      beforeAfter,
      growth: growths.length >= MIN_GROUP
        ? { students: growths.length, avgFgi: Math.round(growths.reduce((s, g) => s + g.fgi, 0) / growths.length), improvedShare: Math.round((growths.filter((g) => g.fgi > 0).length / growths.length) * 100) }
        : { students: growths.length, avgFgi: null, improvedShare: null },
      fitIndia,
      engagement: {
        missions: acts.length,
        activeMin: Math.round(acts.reduce((s, a) => s + a.activeMin, 0)),
        verifiedShare: done ? Math.round((acts.reduce((s, a) => s + (a.verifiedCount || 0), 0) / done) * 100) : 0,
        avgForm: forms.length ? Math.round(forms.reduce((s, a) => s + a.formAvg, 0) / forms.length) : null,
        steps: acts.reduce((s, a) => s + (a.steps || 0), 0),
        comebacks: acts.filter((a) => a.comeback).length,
        classBreaks: acts.filter((a) => a.classBreak).length,
        buddyLinks: Math.round(members.reduce((s, m) => s + (m.buddies || (m.buddy ? [m.buddy] : [])).length, 0) / 2),
        studyMinutes: Math.round(studyMin),
        postureGoodPct: studyMin ? Math.round(study.reduce((s, x) => s + x.goodPct * x.minutes, 0) / studyMin) : null,
      },
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
