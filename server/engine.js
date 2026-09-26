// ATHLORA "Fitness Opportunity Engine"
// Context Engine (time + fitness + environment + recent activity) -> Activity Engine -> Move Mission
// Deliberately a small, curated move set (no huge exercise library).

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const ENVIRONMENTS = ['room', 'hostel', 'classroom', 'campus', 'playground'];
const EQUIPMENT = ['chair', 'stairs', 'band', 'dumbbells'];
const GOALS = ['general', 'strength', 'endurance', 'mobility'];

const ACTIVE = ['room', 'hostel', 'campus', 'playground'];

// cv: which computer-vision counter can verify it (null = timer / self-confirm)
// unit: 'reps' | 'sec' | 'floors'; amount per level [beginner, intermediate, advanced]
// secPer: estimated seconds per unit, used to fit the time budget
const MOVES = [
  // sensor: 'steps' = verifiable with the phone's motion sensors (no wearable needed)
  { id: 'brisk_walk', name: 'Brisk walk', cat: 'endurance', unit: 'sec', amount: [120, 120, 120], secPer: 1, flex: true, sensor: 'steps',
    env: ['campus', 'hostel', 'playground'], cue: 'Walk fast enough that talking feels slightly harder.' },
  { id: 'march', name: 'March in place', cat: 'endurance', unit: 'sec', amount: [60, 60, 60], secPer: 1, flex: true, sensor: 'steps', cv: 'active',
    env: ['room', 'hostel'], cue: 'Lift knees to hip height, swing your arms.' },
  { id: 'stairs', name: 'Climb stairs', cat: 'endurance', unit: 'floors', amount: [2, 3, 4], secPer: 30, equip: 'stairs', sensor: 'steps',
    env: ['hostel', 'campus'], cue: 'Up at a steady pace, walk down carefully.' },
  { id: 'squats', name: 'Squats', cat: 'strength', unit: 'reps', amount: [10, 15, 20], secPer: 3, cv: 'squat',
    env: ACTIVE, cue: 'Feet shoulder-width, hips back, thighs toward parallel.' },
  { id: 'chair_squats', name: 'Chair sit-to-stand', cat: 'strength', unit: 'reps', amount: [8, 12, 15], secPer: 3, cv: 'squat', equip: 'chair',
    env: ['room', 'hostel'], cue: 'Sit down lightly, stand up without using your hands.' },
  { id: 'lunges', name: 'Alternating lunges', cat: 'strength', unit: 'reps', amount: [8, 12, 16], secPer: 3, cv: 'squat', minLevel: 1,
    env: ACTIVE, cue: 'Step forward, lower until both knees are about 90°.' },
  { id: 'wall_pushups', name: 'Wall push-ups', cat: 'strength', unit: 'reps', amount: [10, 12, 15], secPer: 3, cv: 'pushup',
    env: ['room', 'hostel', 'campus'], cue: 'Hands on the wall at shoulder height, body straight.' },
  { id: 'pushups', name: 'Push-ups', cat: 'strength', unit: 'reps', amount: [5, 10, 20], secPer: 3, cv: 'pushup', minLevel: 1,
    env: ['room', 'hostel', 'playground'], cue: 'Body in one line, chest close to the floor. Side-on to the camera.' },
  { id: 'chair_dips', name: 'Chair dips', cat: 'strength', unit: 'reps', amount: [6, 10, 15], secPer: 3, cv: 'pushup', equip: 'chair', minLevel: 1,
    env: ['room', 'hostel'], cue: 'Hands on a stable chair edge, bend elbows to 90°.' },
  { id: 'plank', name: 'Plank hold', cat: 'strength', unit: 'sec', amount: [20, 40, 60], secPer: 1, cv: 'plank',
    env: ['room', 'hostel', 'playground'], cue: 'Forearms down, body straight from head to heels. Side-on to the camera.' },
  { id: 'calf_raises', name: 'Calf raises', cat: 'strength', unit: 'reps', amount: [15, 20, 25], secPer: 2, cv: 'calf',
    env: ACTIVE, cue: 'Rise onto your toes, lower slowly.' },
  { id: 'band_rows', name: 'Resistance band rows', cat: 'strength', unit: 'reps', amount: [10, 12, 15], secPer: 3, equip: 'band', cv: 'elbow',
    env: ['room', 'hostel', 'campus', 'playground'], cue: 'Squeeze shoulder blades together at the end.' },
  { id: 'db_press', name: 'Dumbbell shoulder press', cat: 'strength', unit: 'reps', amount: [8, 10, 12], secPer: 3, equip: 'dumbbells', cv: 'elbow',
    env: ['room', 'hostel'], cue: 'Press overhead without arching your back.' },
  { id: 'jumping_jacks', name: 'Jumping jacks', cat: 'endurance', unit: 'reps', amount: [15, 25, 40], secPer: 1.5, cv: 'jj', impact: 'high',
    env: ['room', 'hostel', 'playground', 'campus'], cue: 'Arms overhead as feet go wide. Face the camera.' },
  { id: 'high_knees', name: 'High knees', cat: 'endurance', unit: 'reps', amount: [30, 40, 60], secPer: 0.8, cv: 'knees', impact: 'high',
    env: ['room', 'hostel', 'playground', 'campus'], cue: 'Drive knees up to hip height, stay light on your feet.' },
  { id: 'mobility_flow', name: 'Mobility flow', cat: 'mobility', unit: 'sec', amount: [30, 30, 45], secPer: 1, cv: 'active',
    env: ACTIVE, cue: 'Hip circles, arm circles, torso twists — smooth and easy.' },
  { id: 'stretch', name: 'Full-body stretch', cat: 'mobility', unit: 'sec', amount: [45, 60, 60], secPer: 1, finisher: true, cv: 'hold',
    env: ACTIVE, cue: 'Hamstrings, quads, chest and shoulders — breathe slowly.' },
  // Classroom mode: quiet, seated, zero-disruption moves (quiet: true)
  // Seated / adaptive mode: everything marked seated: true works from a chair or wheelchair, anywhere
  { id: 'posture_reset', name: 'Posture reset', cat: 'mobility', unit: 'sec', amount: [30, 30, 30], secPer: 1, quiet: true, seated: true, cv: 'hold',
    env: ['classroom'], cue: 'Sit tall, shoulder blades back and down, 5 slow breaths.' },
  { id: 'shoulder_rolls', name: 'Shoulder mobility', cat: 'mobility', unit: 'sec', amount: [30, 30, 45], secPer: 1, quiet: true, seated: true, cv: 'active',
    env: ['classroom', 'room', 'hostel'], cue: 'Big slow shoulder rolls: backwards, then forwards.' },
  { id: 'ankle_circles', name: 'Ankle movement', cat: 'mobility', unit: 'sec', amount: [30, 30, 40], secPer: 1, quiet: true, seated: true, cv: 'hold',
    env: ['classroom'], cue: 'Stay in view and circle each ankle under the desk, both directions.' },
  { id: 'seated_leg_ext', name: 'Seated leg extensions', cat: 'strength', unit: 'reps', amount: [10, 12, 15], secPer: 2, quiet: true, seated: true, cv: 'legext',
    env: ['classroom'], cue: 'Straighten one knee, hold 1 second, lower. Alternate.' },
  { id: 'neck_release', name: 'Neck release', cat: 'mobility', unit: 'sec', amount: [30, 30, 30], secPer: 1, quiet: true, seated: true, cv: 'hold',
    env: ['classroom', 'room', 'hostel'], cue: 'Ear toward shoulder, hold, switch sides. Gentle.' },
  { id: 'seated_march', name: 'Seated march', cat: 'endurance', unit: 'sec', amount: [45, 60, 60], secPer: 1, seated: true, flex: true, cv: 'active',
    env: [], cue: 'Sit tall and lift knees alternately at a brisk pace, pump your arms.' },
  { id: 'seated_arm_raises', name: 'Seated arm raises', cat: 'strength', unit: 'reps', amount: [10, 15, 20], secPer: 2.5, cv: 'arms', seated: true,
    env: [], cue: 'Raise both arms overhead, then lower to shoulder height. Face the camera.' },
  { id: 'seated_punches', name: 'Seated punches', cat: 'endurance', unit: 'reps', amount: [20, 30, 40], secPer: 1, seated: true, cv: 'punch',
    env: [], cue: 'Fast alternating punches forward, keep your core tight.' },
  { id: 'seated_twist', name: 'Seated torso twist', cat: 'mobility', unit: 'sec', amount: [30, 30, 45], secPer: 1, quiet: true, seated: true, cv: 'active',
    env: [], cue: 'Hands on shoulders, rotate slowly left and right from the waist.' },
  { id: 'seated_stretch', name: 'Seated full-body stretch', cat: 'mobility', unit: 'sec', amount: [45, 45, 60], secPer: 1, seated: true, seatedFinisher: true, cv: 'hold',
    env: [], cue: 'Reach overhead, lean side to side, then fold forward gently.' },
];

const TRANSITION = 10; // seconds between moves

function levelIndex(user) {
  const i = LEVELS.indexOf(user.profile?.fitnessLevel);
  return i === -1 ? 0 : i;
}

function estSeconds(move, amount) {
  return Math.round(amount * move.secPer);
}

function xpFor(sec) {
  return Math.max(5, Math.round(sec / 5));
}

function weightedPick(list, weightFn) {
  const total = list.reduce((s, m) => s + weightFn(m), 0);
  let r = Math.random() * total;
  for (const m of list) {
    r -= weightFn(m);
    if (r <= 0) return m;
  }
  return list[list.length - 1];
}

// ---------- Adaptive difficulty: each student's targets learn from their verified results ----------
const round5 = (n) => Math.round(n / 5) * 5;
function scaleAmount(move, base, factor) {
  if (move.flex || factor === 1) return base;
  const v = base * factor;
  return move.unit === 'sec' ? Math.max(10, round5(v)) : Math.max(1, Math.round(v));
}
function personalAmount(user, move, li, { learn = true } = {}) {
  const factor = learn ? user.adaptiveTargets?.[move.id]?.factor ?? 1 : 1;
  return scaleAmount(move, move.amount[li], factor);
}

/**
 * Updates user.adaptiveTargets from a completed mission.
 * strong = verified (camera/sensor), target met, form 80+ ; weak = skipped, < 70% of target, or form < 55.
 * Two strong results in a row raise the target 10%; two weak ones lower it 10%. Unverified work never raises it.
 * @returns changes [{ moveId, name, unit, from, to, direction }]
 */
function adaptTargets(user, mission, results) {
  if (mission.comeback) return [];
  const state = (user.adaptiveTargets ||= {});
  const li = LEVELS.indexOf(mission.level) === -1 ? levelIndex(user) : LEVELS.indexOf(mission.level);
  const changes = [];
  const byMove = new Map();
  mission.items.forEach((item, i) => {
    if (!byMove.has(item.moveId)) byMove.set(item.moveId, []);
    byMove.get(item.moveId).push({ item, r: results[i] || {} });
  });
  for (const [moveId, rounds] of byMove) {
    const move = MOVES.find((m) => m.id === moveId);
    if (!move || move.flex) continue;
    const judge = ({ item, r }) => {
      const ratio = r.done ? Math.min(1, (Number(r.achieved ?? item.target) || 0) / item.target) : 0;
      const form = Number.isFinite(Number(r.formScore)) && r.formScore !== null ? Number(r.formScore) : null;
      const verified = Boolean(r.verified && (item.cv || item.sensor));
      if (!r.done || ratio < 0.7 || (verified && form !== null && form < 55)) return 'weak';
      if (verified && ratio >= 1 && (form === null || form >= 80)) return 'strong';
      return 'neutral';
    };
    const verdicts = rounds.map(judge);
    const verdict = verdicts.includes('weak') ? 'weak' : verdicts.every((v) => v === 'strong') ? 'strong' : 'neutral';
    const s = (state[moveId] ||= { factor: 1, good: 0, bad: 0, history: [] });
    s.history = [...s.history, { at: Date.now(), verdict, target: rounds[0].item.target }].slice(-12);
    if (verdict === 'strong') { s.good++; s.bad = 0; }
    else if (verdict === 'weak') { s.bad++; s.good = 0; }
    const before = scaleAmount(move, move.amount[li], s.factor);
    if (s.good >= 2) { s.factor = Math.min(2.5, Math.round(s.factor * 1.1 * 100) / 100); s.good = 0; }
    if (s.bad >= 2) { s.factor = Math.max(0.6, Math.round(s.factor * 0.9 * 100) / 100); s.bad = 0; }
    const after = scaleAmount(move, move.amount[li], s.factor);
    if (after !== before) changes.push({ moveId, name: move.name, unit: move.unit, from: before, to: after, direction: after > before ? 'up' : 'down' });
  }
  return changes;
}

// Personal targets for the Passport: starting target at the student's level vs the learned one
function personalTargets(user) {
  const li = levelIndex(user);
  return Object.entries(user.adaptiveTargets || {})
    .map(([moveId, s]) => {
      const move = MOVES.find((m) => m.id === moveId);
      if (!move || move.flex) return null;
      const start = move.amount[li];
      const current = scaleAmount(move, start, s.factor);
      return { moveId, name: move.name, unit: move.unit, start, current, pct: Math.round((current / start - 1) * 100), sessions: s.history.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.sessions - a.sessions);
}

function makeItem(move, amount, label, baseAmount = amount) {
  const sec = estSeconds(move, amount);
  return {
    moveId: move.id,
    name: label || move.name,
    unit: move.unit,
    target: amount,
    baseTarget: baseAmount,
    personalized: amount !== baseAmount,
    cv: move.cv || null,
    sensor: move.sensor || null,
    cue: move.cue,
    estSec: sec,
    xp: xpFor(sec),
  };
}

function missionTitle(minutes, { classroom, comeback, adaptive }) {
  if (comeback) return `${minutes} MIN COMEBACK`;
  if (classroom) return 'CLASSROOM MODE';
  if (adaptive) return `${minutes} MIN SEATED ${minutes <= 5 ? 'RESET' : 'BOOST'}`;
  if (minutes <= 3) return `${minutes} MIN RESET`;
  if (minutes <= 7) return `${minutes} MIN QUICK MOVE`;
  if (minutes <= 12) return `${minutes} MIN ENERGY BOOST`;
  return `${minutes} MIN POWER SESSION`;
}

/**
 * @param user     full user record (profile, onboarding)
 * @param ctx      { minutes, environment, equipment[] }
 * @param recent   { comeback: boolean, inactiveDays }
 */
function generateMission(user, ctx, recent) {
  const environment = ENVIRONMENTS.includes(ctx.environment) ? ctx.environment : 'room';
  const equipment = (ctx.equipment || []).filter((e) => EQUIPMENT.includes(e));
  const classroom = environment === 'classroom';
  const comeback = Boolean(recent?.comeback);
  let minutes = Math.max(2, Math.min(30, Math.round(Number(ctx.minutes) || 5)));
  if (comeback) minutes = Math.min(minutes, 4);

  const li = comeback ? 0 : levelIndex(user);
  const goal = GOALS.includes(user.profile?.goal) ? user.profile.goal : 'general';
  const lowImpact = Boolean(user.medical?.has);
  const adaptive = Boolean(user.profile?.adaptive);

  // Adaptive (seated) mode: only chair-friendly moves, in any environment
  const pool = MOVES.filter((m) => adaptive
    ? m.seated && (!m.equip || equipment.includes(m.equip)) && (!classroom || m.quiet)
    : m.env.includes(environment) &&
      (!m.equip || equipment.includes(m.equip)) &&
      (m.minLevel || 0) <= li &&
      !(lowImpact && m.impact === 'high') &&
      (!classroom || m.quiet)
  ).map((m) => (adaptive && m.seatedFinisher ? { ...m, finisher: true } : m));

  const budget = minutes * 60;
  let used = 0;
  const items = [];
  const usedIds = new Set();
  const fits = (sec) => used + sec + TRANSITION <= budget + 15;
  // Personal (learned) amounts, except in comeback missions which stay easy
  const amt = (m) => personalAmount(user, m, li, { learn: !comeback });
  const add = (move, label) => {
    const amount = amt(move);
    const item = makeItem(move, amount, label, move.amount[li]);
    items.push(item);
    usedIds.add(move.id);
    used += item.estSec + TRANSITION;
    return item;
  };

  // 1. Warm-up movement for missions of 5+ minutes
  const warm = pool.find((m) => m.flex) || pool.find((m) => m.cat === 'mobility' && !m.finisher);
  if (!classroom && minutes >= 5 && warm) add(warm);

  // 2. Reserve room for a finisher stretch on longer missions
  const finisher = pool.find((m) => m.finisher);
  const reserve = !classroom && minutes >= 5 && finisher ? estSeconds(finisher, amt(finisher)) + TRANSITION : 0;

  // 3. Main block: a few distinct moves weighted toward the student's goal,
  //    repeated in rounds when there is time (a focused mission beats a long list)
  const maxMain = minutes <= 3 ? 3 : minutes <= 5 ? 4 : minutes <= 12 ? 5 : 6;
  const weight = (m) => (goal !== 'general' && m.cat === goal ? 3 : 1) * (m.cv ? 1.5 : 1);
  const mainSet = [];
  for (let guard = 0; guard < 40 && mainSet.length < maxMain; guard++) {
    const candidates = pool.filter((m) => !usedIds.has(m.id) && !m.finisher && !m.flex &&
      fits(estSeconds(m, amt(m)) + reserve));
    if (!candidates.length) break;
    const m = weightedPick(candidates, weight);
    add(m);
    mainSet.push(m);
  }
  // Seated moves are short: short seated missions stop at 2 rounds and give leftover time to the seated march
  const maxRounds = adaptive && minutes < 15 ? 2 : 3;
  for (let round = 2; round <= maxRounds && mainSet.length; round++) {
    let added = 0;
    for (const m of mainSet) {
      if (!fits(estSeconds(m, amt(m)) + reserve)) continue;
      add(m, `${m.name} (round ${round})`);
      added++;
    }
    if (!added) break;
  }

  if (reserve && fits(reserve - TRANSITION)) add(finisher);

  // 4. Hand leftover time to the flexible move (walking), so the mission fills the gap
  const flexItem = items.find((it) => MOVES.find((m) => m.id === it.moveId).flex);
  const leftover = budget - used;
  if (flexItem && leftover > 20) {
    flexItem.target += Math.floor(leftover / 10) * 10;
    flexItem.estSec = flexItem.target;
    flexItem.xp = xpFor(flexItem.estSec);
  }

  // Guarantee at least one item
  if (!items.length && pool.length) add(pool[0]);

  const followUp = classroom
    ? { text: '2-minute walking mission after class', minutes: 2, environment: 'campus' }
    : null;

  return {
    title: missionTitle(minutes, { classroom, comeback, adaptive }),
    minutes,
    environment,
    equipment,
    level: LEVELS[li],
    comeback,
    lowImpact,
    adaptive,
    items,
    maxXp: Math.round(items.reduce((s, it) => s + it.xp * 1.5, 0)) + 10 + (comeback ? 30 : 0),
    followUp,
  };
}

/**
 * results: [{ done, verified, achieved, formScore? }]
 * Verified (camera-confirmed) work earns 1.5x; verified work with good form (>= 80) earns a further 20%.
 */
function scoreMission(mission, results, { firstToday, streakAfter, buddiesMovedToday = 0 }) {
  let xp = 0;
  let formXp = 0;
  let activeSec = 0;
  let verifiedCount = 0;
  let doneCount = 0;
  const formScores = [];
  const breakdown = [];

  mission.items.forEach((item, i) => {
    const r = results[i] || {};
    if (!r.done) return;
    doneCount++;
    const achieved = Math.max(0, Number(r.achieved ?? item.target) || 0);
    const ratio = Math.min(1, achieved / item.target);
    const verified = Boolean(r.verified && (item.cv || item.sensor));
    if (verified) verifiedCount++;
    const itemXp = Math.round(item.xp * ratio * (verified ? 1.5 : 1));
    xp += itemXp;
    activeSec += item.estSec * ratio;
    const form = r.formScore === null || r.formScore === undefined ? NaN : Number(r.formScore);
    if (verified && item.cv && Number.isFinite(form) && form >= 0 && form <= 100) {
      formScores.push(form);
      if (form >= 80) formXp += Math.round(itemXp * 0.2);
    }
  });

  breakdown.push({ label: 'Mission work', xp });
  if (formXp) {
    xp += formXp;
    breakdown.push({ label: 'Good form bonus', xp: formXp });
  }
  if (doneCount === mission.items.length && doneCount > 0) {
    xp += 10;
    breakdown.push({ label: 'Mission complete', xp: 10 });
  }
  if (doneCount > 0 && mission.comeback) {
    xp += 30;
    breakdown.push({ label: 'Welcome back bonus', xp: 30 });
  }
  if (doneCount > 0 && firstToday && streakAfter > 1) {
    const b = 2 * Math.min(streakAfter, 10);
    xp += b;
    breakdown.push({ label: `${streakAfter}-day consistency`, xp: b });
  }
  if (doneCount > 0 && firstToday && buddiesMovedToday > 0) {
    xp += 10;
    breakdown.push({ label: `You and ${buddiesMovedToday} ${buddiesMovedToday === 1 ? 'buddy' : 'buddies'} moved today`, xp: 10 });
  }
  const formAvg = formScores.length ? Math.round(formScores.reduce((a, b) => a + b, 0) / formScores.length) : null;
  return { xp, activeMin: Math.round((activeSec / 60) * 10) / 10, verifiedCount, doneCount, formAvg, breakdown };
}

// ---------- Fitness assessment (AI Engine 1) ----------
// norm = the value treated as a strong result for a student (used for level + bands)
const TESTS = [
  { key: 'squats', label: 'Squats in 30s', norm: 25 },
  { key: 'pushups', label: 'Push-ups in 30s', norm: 20 },
  { key: 'jumpingJacks', label: 'Jumping jacks in 30s', norm: 35 },
  { key: 'plankSec', label: 'Plank hold (sec)', norm: 60 },
  { key: 'mobility', label: 'Squat-depth mobility', norm: 100 },
  { key: 'flexibility', label: 'Forward-fold flexibility', norm: 100 },
  { key: 'balanceSec', label: 'Single-leg balance (sec)', norm: 60 },
  { key: 'armRaises', label: 'Seated arm raises in 30s', norm: 30 },
];

// Components of the Fit India Fitness Protocol that ATHLORA's camera tests cover.
// (Body composition / BMI is part of the protocol but ATHLORA deliberately collects no body measurements.)
const FIT_INDIA_COMPONENTS = [
  { key: 'muscular', label: 'Muscular endurance', tests: ['pushups', 'squats', 'armRaises'] },
  { key: 'core', label: 'Core strength', tests: ['plankSec'] },
  { key: 'cardio', label: 'Cardiovascular endurance', tests: ['jumpingJacks'] },
  { key: 'flexibility', label: 'Flexibility', tests: ['flexibility', 'mobility'] },
  { key: 'balance', label: 'Balance', tests: ['balanceSec'] },
];

function band(score) {
  return score < 40 ? 'Needs work' : score < 60 ? 'Fair' : score < 80 ? 'Good' : 'Excellent';
}

function fitIndiaReport(results) {
  if (!results) return null;
  return FIT_INDIA_COMPONENTS.map((c) => {
    const scores = c.tests
      .map((k) => TESTS.find((t) => t.key === k))
      .filter((t) => typeof results[t.key] === 'number')
      .map((t) => Math.min(100, (results[t.key] / t.norm) * 100));
    if (!scores.length) return { key: c.key, label: c.label, measured: false };
    const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { key: c.key, label: c.label, measured: true, score, band: band(score) };
  });
}

// ---------- Timetable-aware Opportunity Engine ----------
const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const fmtMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Finds today's realistic movement windows from the class timetable.
 * @param tt            { dayStart: 'HH:MM', dayEnd: 'HH:MM', classes: [{ day: 0-6 (Sun=0), start, end, title }] }
 * @param day           today's weekday (Sun=0)
 * @param nowMin        minutes since local midnight
 * @param completedMins minute-of-day of each mission completed today
 */
function findOpportunities(tt, day, nowMin, completedMins = []) {
  if (!tt) return [];
  const classes = (tt.classes || [])
    .filter((c) => c.day === day)
    .map((c) => ({ title: c.title || 'class', s: toMin(c.start), e: toMin(c.end) }))
    .filter((c) => c.s !== null && c.e !== null && c.e > c.s)
    .sort((a, b) => a.s - b.s);
  if (!classes.length) return [];

  const dayStart = toMin(tt.dayStart) ?? 8 * 60;
  const dayEnd = toMin(tt.dayEnd) ?? 18 * 60;
  const ops = [];
  // buffer = minutes kept free to walk to the next class
  const addGap = (s, e, environment, label, buffer) => {
    const minutes = Math.min(20, e - s - buffer);
    if (minutes < 3) return;
    ops.push({ start: s, end: s + minutes, minutes, environment, label });
  };

  let cursor = Math.min(dayStart, classes[0].s);
  let prev = null;
  for (const c of classes) {
    if (c.s > cursor) {
      if (!prev) addGap(Math.max(cursor, c.s - 30), c.s, 'hostel', `Before ${c.title}`, 5);
      else addGap(cursor, c.s, 'campus', `Between ${prev.title} and ${c.title}`, 2);
    }
    // Long lectures get a quiet 2-minute classroom reset halfway through
    if (c.e - c.s >= 75) {
      const mid = c.s + Math.floor((c.e - c.s) / 2) - 1;
      ops.push({ start: mid, end: mid + 2, minutes: 2, environment: 'classroom', label: `Mid-${c.title} reset` });
    }
    cursor = Math.max(cursor, c.e);
    prev = c;
  }
  if (dayEnd > cursor) addGap(cursor + 10, dayEnd, 'hostel', 'After classes', 0);

  return ops
    .sort((a, b) => a.start - b.start)
    .map((op) => {
      const done = completedMins.some((t) => t >= op.start - 5 && t <= op.end + 15);
      const status = done ? 'done' : nowMin > op.end ? 'missed' : nowMin >= op.start ? 'now' : 'upcoming';
      return { ...op, from: fmtMin(op.start), to: fmtMin(op.end), status };
    });
}

function levelFromAssessment(results) {
  const scores = TESTS.filter((t) => typeof results[t.key] === 'number')
    .map((t) => Math.min(1.2, results[t.key] / t.norm));
  if (!scores.length) return 'beginner';
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg < 0.4 ? 'beginner' : avg < 0.75 ? 'intermediate' : 'advanced';
}

// Fitness Growth Index: average % improvement vs the student's own baseline
function fitnessGrowth(baseline, latest) {
  if (!baseline || !latest || baseline.id === latest.id) return null;
  const perTest = [];
  for (const t of TESTS) {
    const b = baseline.results[t.key];
    const l = latest.results[t.key];
    if (typeof b !== 'number' || typeof l !== 'number') continue;
    const pct = b > 0 ? ((l - b) / b) * 100 : l > 0 ? 100 : 0;
    perTest.push({ key: t.key, label: t.label, baseline: b, latest: l, pct: Math.round(pct) });
  }
  if (!perTest.length) return null;
  const fgi = Math.round(perTest.reduce((s, p) => s + p.pct, 0) / perTest.length);
  return { fgi, perTest };
}

// ---------- Teacher-led class movement break ----------
// Desk-side routines for a whole class: 20 seconds per move, no equipment, no noise.
const BREAK_MOVES = {
  standing: [
    { name: 'Stand tall & reach up', cue: 'Stand up, reach both arms high and stretch tall.' },
    { name: 'March on the spot', cue: 'Lift your knees and swing your arms.' },
    { name: 'Shoulder rolls', cue: 'Big slow circles backwards, then forwards.' },
    { name: 'Torso twist', cue: 'Hands on hips, twist gently left and right.' },
    { name: 'Calf raises', cue: 'Rise onto your toes, then lower slowly.' },
    { name: 'Desk push-ups', cue: 'Hands on the desk edge, lower your chest, push away.' },
    { name: 'Side stretch', cue: 'Reach one arm over your head and lean. Switch sides.' },
    { name: 'Deep breaths', cue: 'Breathe in for 4, out for 6. Relax your shoulders.' },
  ],
  seated: [
    { name: 'Posture reset', cue: 'Sit tall, shoulder blades back and down.' },
    { name: 'Seated march', cue: 'Lift your knees alternately, pump your arms.' },
    { name: 'Shoulder rolls', cue: 'Big slow circles backwards, then forwards.' },
    { name: 'Seated arm raises', cue: 'Raise both arms overhead, then lower.' },
    { name: 'Seated torso twist', cue: 'Hands on shoulders, rotate slowly left and right.' },
    { name: 'Ankle circles', cue: 'Circle each ankle under the desk.' },
    { name: 'Neck release', cue: 'Ear toward shoulder, hold, switch sides. Gently.' },
    { name: 'Deep breaths', cue: 'Breathe in for 4, out for 6. Relax.' },
  ],
};
const BREAK_MOVE_SEC = 20;

function classBreakRoutine(minutes, seated) {
  const list = BREAK_MOVES[seated ? 'seated' : 'standing'];
  const count = Math.max(3, Math.floor((minutes * 60) / BREAK_MOVE_SEC));
  // End every routine on the calming final move
  const moves = Array.from({ length: count - 1 }, (_, i) => list[i % (list.length - 1)]);
  moves.push(list[list.length - 1]);
  return moves.map((m) => ({ ...m, sec: BREAK_MOVE_SEC }));
}

module.exports = {
  LEVELS, ENVIRONMENTS, EQUIPMENT, GOALS, TESTS, FIT_INDIA_COMPONENTS,
  generateMission, scoreMission, levelFromAssessment, fitnessGrowth,
  fitIndiaReport, findOpportunities, toMin,
  adaptTargets, personalTargets, classBreakRoutine,
};
