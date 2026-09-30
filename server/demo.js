// "Try demo" profiles for judges and visitors.
// One shared "Demo Profile" with ~2 weeks of starting history (made by running the real mission
// engine and scoring), in the "ATHLORA Demo College" community with 9 sample classmates.
// It's fully usable and persistent: XP a visitor earns stays for the next visitor. If it sits unused,
// its history slides forward so the streak is alive whenever it's opened.
// The Demo Profile and classmates also appear in every student's "Everyone" leaderboard.
const crypto = require('crypto');

const DAY = 86400000;
const COMMUNITY = 'ATHLORA Demo College';
const PIN = 'demo2026';
const PEERS = [
  ['Aarav Sharma', 1900], ['Diya Patel', 1750], ['Kabir Singh', 1500], ['Ananya Iyer', 1250],
  ['Rohan Gupta', 980], ['Meera Nair', 760], ['Arjun Reddy', 540], ['Sara Khan', 330], ['Vivaan Joshi', 150],
];
const TITLES = ['5 MIN QUICK MOVE', '10 MIN ENERGY BOOST', '15 MIN POWER SESSION', '3 MIN RESET', 'CLASSROOM MODE'];

// Small deterministic random generator so each profile looks natural but varied
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

module.exports = function demoSeeder({ kv, engine, K, sha, campusKey, dayKey, hmac, uid }) {
  const localMidnight = (offset, daysAgo) => Date.parse(dayKey(Date.now() - daysAgo * DAY, offset) + 'T00:00:00Z') + offset * 60000;
  // A local time N days ago, never in the future
  const at = (offset, daysAgo, hour, minute = 0) => Math.min(Date.now() - 60000, localMidnight(offset, daysAgo) + (hour * 60 + minute) * 60000);
  const award = (u, xp, when, detail) => { u.xp = (u.xp || 0) + xp; u.xpLog.push({ at: when, xp, ...detail }); };

  function assess(u, when, results, prior) {
    const level = engine.levelFromAssessment(results);
    const rec = { id: uid(), createdAt: when, results, verified: Object.fromEntries(Object.keys(results).map((k) => [k, true])), level };
    let xp = 40;
    const breakdown = [{ label: prior ? 'Re-assessment' : 'AI baseline set', xp: 40 }];
    const g = prior ? engine.fitnessGrowth(prior, rec) : null;
    if (g && g.fgi > 0) { const b = Math.min(100, g.fgi); xp += b; breakdown.push({ label: `Improved ${g.fgi}% since last test`, xp: b }); }
    u.assessments.push(rec);
    award(u, xp, when, {
      kind: 'assessment', title: prior ? 'AI fitness re-test' : 'AI fitness test', bonuses: breakdown,
      items: Object.entries(results).filter(([k]) => k !== 'mobility').map(([k, v]) => ({ name: engine.TESTS.find((t) => t.key === k)?.label || k, result: v, how: 'camera' })),
    });
    u.profile.fitnessLevel = level;
    return rec;
  }

  // Runs a real mission through the engine with realistic (mostly camera-verified) results
  function playMission(u, rand, when, { minutes, env, streakAfter = 1 }) {
    const m = engine.generateMission(u, { minutes, environment: env, equipment: u.profile.equipment }, {});
    const results = m.items.map((it) => {
      const done = rand() > 0.07;
      const verified = done && Boolean(it.cv || it.sensor) && rand() > 0.15;
      return {
        done, verified, achieved: it.target,
        formScore: verified && it.cv ? Math.round(66 + rand() * 28) : null,
        steps: verified && it.sensor ? Math.round(it.target * (it.unit === 'floors' ? 18 : 1.7)) : undefined,
      };
    });
    if (!results.some((r) => r.done)) results[0].done = true;
    const score = engine.scoreMission(m, results, { firstToday: true, streakAfter, buddiesMovedToday: 0 });
    engine.adaptTargets(u, m, results);
    const activityId = uid();
    u.activities.push({
      id: activityId, missionId: uid(), title: m.title, minutes: m.minutes, environment: m.environment, comeback: false,
      xp: score.xp, activeMin: score.activeMin, verifiedCount: score.verifiedCount, doneCount: score.doneCount, formAvg: score.formAvg,
      steps: results.reduce((s, r, i) => s + (m.items[i].sensor && r.verified ? r.steps || 0 : 0), 0),
      completedAt: when,
    });
    award(u, score.xp, when, {
      kind: 'mission', title: m.title, activityId, items: score.items,
      bonuses: score.breakdown.filter((b) => b.xp && b.label !== 'Mission work' && b.label !== 'Good form bonus'),
    });
  }

  // The demo is identical on every click (same missions, XP, scores, badges); only the dates
  // move with the day it's opened, so the history always looks recent and the streak is alive.
  function buildDemoUser(offset, peers) {
    const rand = rng(20260930);
    const realRandom = Math.random;
    Math.random = rand; // the mission engine shuffles with Math.random: make it repeatable while seeding
    try {
      return seedDemoUser(offset, peers, rand);
    } finally {
      Math.random = realRandom;
    }
  }

  function seedDemoUser(offset, peers, rand) {
    const now = Date.now();
    const classes = [1, 2, 3, 4, 5, 6].flatMap((day) => [
      { id: uid(), day, start: '09:00', end: '10:00', title: 'Physics' },
      { id: uid(), day, start: '10:15', end: '11:45', title: 'Mathematics' },
      { id: uid(), day, start: '14:00', end: '15:00', title: 'English' },
    ]).concat([
      { id: uid(), day: 0, start: '10:00', end: '11:00', title: 'Study group' },
      { id: uid(), day: 0, start: '14:00', end: '15:30', title: 'Lab' },
    ]);
    const u = {
      id: uid(), name: 'Demo Profile', email: `demo-${crypto.randomBytes(4).toString('hex')}@demo.athlora.app`, demo: true, demoMain: true,
      createdAt: now - 16 * DAY, onboarded: true, age: 19,
      medical: { has: false, conditions: [], notes: '' }, sports: { plays: true, list: ['Cricket'] },
      campus: COMMUNITY, xp: 0, xpLog: [], missions: [], activities: [], assessments: [], studySessions: [],
      profile: { fitnessLevel: 'intermediate', goal: 'general', equipment: ['chair'], environment: 'room', levelSource: 'assessment', contextSaved: true },
      timetable: { dayStart: '08:00', dayEnd: '18:00', classes },
      // Sample classmates as buddies (one-way, see /buddy)
      buddies: [peers[1], peers[3], peers[5]].map((p) => ({ userId: p.id, since: now - 10 * DAY })),
    };

    const base = assess(u, at(offset, 14, 17, 30), { squats: 14, pushups: 9, jumpingJacks: 22, plankSec: 35, mobility: 48, flexibility: 42, balanceSec: 24 }, null);

    // Missions on these days (days ago). Days 1–6 are consecutive, so the student has a live 6-day streak
    // and today is still open ("keep your streak alive").
    const days = [13, 12, 10, 9, 8, 6, 5, 4, 3, 2, 1];
    const set = new Set(days);
    for (const d of days) {
      let streak = 0;
      for (let x = d; set.has(x); x++) streak++;
      const env = ['room', 'hostel', 'campus'][Math.floor(rand() * 3)];
      playMission(u, rand, at(offset, d, 8 + Math.floor(rand() * 11), Math.floor(rand() * 59)), { minutes: [5, 10, 10, 15][Math.floor(rand() * 4)], env, streakAfter: streak });
      if (d === 5 || d === 2) playMission(u, rand, at(offset, d, 20, 10), { minutes: 3, env: 'room' });
    }

    for (const [d, min, good] of [[9, 32, 74], [5, 45, 81], [2, 28, 86]]) {
      const when = at(offset, d, 21, 5);
      u.studySessions.push({ at: when, minutes: min, goodPct: good, alerts: Math.round((100 - good) / 10), breaksTaken: 1 });
      const bonuses = [{ label: 'Studied with Posture Guardian', xp: Math.min(20, Math.floor(min / 10) * 5) }];
      if (good >= 70) bonuses.push({ label: 'Good posture 70%+ of the time', xp: 5 });
      award(u, bonuses.reduce((s, b) => s + b.xp, 0), when, { kind: 'study', title: `Posture Guardian study session · ${min} min`, bonuses });
    }

    const breakWhen = at(offset, 3, 11, 0);
    const breakId = uid();
    u.activities.push({ id: breakId, title: 'CLASS BREAK · Class movement break', minutes: 2, environment: 'classroom', comeback: false, classBreak: true, xp: 15, activeMin: 2, verifiedCount: 0, doneCount: 6, formAvg: null, steps: 0, completedAt: breakWhen });
    award(u, 15, breakWhen, { kind: 'class', title: 'Class break · Class movement break', activityId: breakId, bonuses: [{ label: 'Class movement break', xp: 15 }] });

    assess(u, at(offset, 2, 18, 15), { squats: 18, pushups: 12, jumpingJacks: 27, plankSec: 47, mobility: 57, flexibility: 51, balanceSec: 33 }, base);

    u.activities.sort((a, b) => a.completedAt - b.completedAt);
    u.xpLog.sort((a, b) => a.at - b.at);
    return u;
  }

  function peerActivity(rand, when, xp) {
    return {
      id: uid(), title: TITLES[Math.floor(rand() * TITLES.length)], minutes: 10, environment: ['room', 'hostel', 'campus', 'classroom'][Math.floor(rand() * 4)],
      comeback: false, xp, activeMin: Math.round(4 + rand() * 9), verifiedCount: Math.round(1 + rand() * 4), doneCount: 6,
      formAvg: Math.round(64 + rand() * 30), steps: Math.round(rand() * 300), completedAt: when,
    };
  }

  // One sample classmate, always built from the same fixed values with dates relative to today.
  // Some of them "moved today" (so buddies show ✓ and the leaderboard shows ▲/▼).
  function buildPeer(i, offset) {
    const [name, baseXp] = PEERS[i];
    const id = `demo-peer-${i + 1}`;
    const rand = rng(i + 7);
    const p = {
      id, name, email: `${id}@demo.athlora.app`, demoPeer: true, onboarded: true, createdAt: Date.now() - 30 * DAY,
      campus: COMMUNITY, age: 18 + (i % 4), xp: baseXp, xpLog: [], activities: [], assessments: [], missions: [], studySessions: [],
      medical: { has: false, conditions: [], notes: '' }, sports: { plays: i % 3 === 0, list: i % 3 === 0 ? ['Football'] : [] },
      profile: { fitnessLevel: ['beginner', 'intermediate', 'advanced'][i % 3], goal: 'general', equipment: [], environment: 'hostel', levelSource: 'assessment' },
    };
    const n = Math.max(3, Math.round(baseXp / 140));
    for (let k = 0; k < n; k++) {
      const d = 1 + Math.floor(rand() * 20);
      p.activities.push(peerActivity(rand, at(offset, d, 7 + Math.floor(rand() * 14), Math.floor(rand() * 59)), Math.round(40 + rand() * 40)));
    }
    const b = { squats: 10 + i, pushups: 6 + (i % 5), jumpingJacks: 18 + i, plankSec: 25 + i * 3, flexibility: 35 + i * 2, balanceSec: 15 + i * 2 };
    const l = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * (1.1 + rand() * 0.25))]));
    p.assessments = [
      { id: uid(), createdAt: Date.now() - 18 * DAY, results: b, verified: {}, level: engine.levelFromAssessment(b) },
      { id: uid(), createdAt: Date.now() - 3 * DAY, results: l, verified: {}, level: engine.levelFromAssessment(l) },
    ];
    if ([0, 1, 2, 4, 6].includes(i)) {
      const gain = i === 1 ? 260 : 40 + i * 12; // Diya climbs past Aarav today
      const when = at(offset, 0, 7 + i, 20);
      p.activities.push(peerActivity(rand, when, gain));
      p.xp += gain;
      p.xpLog.push({ at: when, xp: gain, kind: 'mission', title: '10 MIN ENERGY BOOST' });
    }
    p.activities.sort((a, x) => a.completedAt - x.completedAt);
    return p;
  }

  // Classmates are rebuilt from scratch once a day, so the demo community looks the same
  // whenever it is opened (no drift over weeks or months).
  async function ensurePeers(offset) {
    const today = dayKey(Date.now(), offset);
    const meta = await kv.get('demo/meta');
    const fresh = meta?.day === today && meta?.v === 2;
    const peers = [];
    for (let i = 0; i < PEERS.length; i++) {
      const id = `demo-peer-${i + 1}`;
      let p = fresh ? await kv.get(K.user(id)) : null;
      if (!p) {
        p = buildPeer(i, offset);
        await kv.set(K.user(id), p);
        await kv.set(K.campusPrefix(COMMUNITY) + id, { joinedAt: p.createdAt });
      }
      peers.push(p);
    }
    if (!fresh) await kv.set('demo/meta', { day: today, v: 2 });

    // Institution dashboard for the demo community (PIN shown in the demo banner)
    const instKey = `institution/${sha(campusKey(COMMUNITY))}`;
    if (!(await kv.get(instKey))) {
      await kv.set(instKey, { name: COMMUNITY, pinHash: hmac('inst:' + campusKey(COMMUNITY) + ':' + PIN), createdAt: Date.now() });
    }
    return peers;
  }

  // Demo profiles older than 2 days are removed (checked on each new demo)
  async function cleanup() {
    const keys = (await kv.list('demoindex/')).slice(0, 40);
    for (const key of keys) {
      const entry = await kv.get(key);
      if (entry && Date.now() - entry.createdAt < 2 * DAY) continue;
      const id = key.slice('demoindex/'.length);
      await kv.delete(K.user(id));
      await kv.delete(K.campusPrefix(COMMUNITY) + id);
      await kv.delete(key);
    }
  }

  // Moves every timestamp in the profile forward by `ms` (whole days, so local times stay the same)
  const TIME_KEYS = new Set(['at', 'createdAt', 'completedAt', 'since', 'joinedAt', 'startedAt', 'endedAt', 'updatedAt', 'issuedAt']);
  function shiftTimes(obj, ms) {
    if (Array.isArray(obj)) { obj.forEach((x) => shiftTimes(x, ms)); return; }
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (TIME_KEYS.has(k) && typeof v === 'number' && v > 1e12) obj[k] = v + ms;
      else if (v && typeof v === 'object') shiftTimes(v, ms);
    }
  }

  // If nobody has used the demo for a while, slide its whole history forward so the last
  // active day was yesterday: XP, badges and everything visitors earned stay, and the
  // streak is still alive (today open) whenever it's opened, even months later.
  function keepCurrent(u, offset) {
    const last = Math.max(0, ...(u.activities || []).map((a) => a.completedAt));
    if (!last) return false;
    const lag = Math.round((Date.parse(dayKey(Date.now(), offset)) - Date.parse(dayKey(last, offset))) / DAY);
    if (lag < 2) return false;
    shiftTimes(u, (lag - 1) * DAY);
    u.missions = []; // unfinished missions from before are dropped
    return true;
  }

  return {
    COMMUNITY, PIN,
    // Everyone who taps "Try the demo" opens the same shared Demo Profile. What one visitor
    // earns (XP, streak, badges) is still there for the next one.
    async createDemo(offset) {
      await cleanup().catch(() => {}); // removes per-visitor copies made by older versions
      const peers = await ensurePeers(offset);
      const ref = await kv.get('demo/profile');
      let u = ref && (await kv.get(K.user(ref.id)));
      if (!u) {
        u = buildDemoUser(offset, peers);
        await kv.set('demo/profile', { id: u.id });
      } else if (!keepCurrent(u, offset)) {
        return u;
      }
      await kv.set(K.user(u.id), u);
      await kv.set(K.campusPrefix(COMMUNITY) + u.id, { joinedAt: u.createdAt });
      return u;
    },
  };
};
