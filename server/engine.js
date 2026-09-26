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
  { id: 'brisk_walk', name: 'Brisk walk', cat: 'endurance', unit: 'sec', amount: [120, 120, 120], secPer: 1, flex: true,
    env: ['campus', 'hostel', 'playground'], cue: 'Walk fast enough that talking feels slightly harder.' },
  { id: 'march', name: 'March in place', cat: 'endurance', unit: 'sec', amount: [60, 60, 60], secPer: 1, flex: true,
    env: ['room', 'hostel'], cue: 'Lift knees to hip height, swing your arms.' },
  { id: 'stairs', name: 'Climb stairs', cat: 'endurance', unit: 'floors', amount: [2, 3, 4], secPer: 30, equip: 'stairs',
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
  { id: 'calf_raises', name: 'Calf raises', cat: 'strength', unit: 'reps', amount: [15, 20, 25], secPer: 2,
    env: ACTIVE, cue: 'Rise onto your toes, lower slowly.' },
  { id: 'band_rows', name: 'Resistance band rows', cat: 'strength', unit: 'reps', amount: [10, 12, 15], secPer: 3, equip: 'band',
    env: ['room', 'hostel', 'campus', 'playground'], cue: 'Squeeze shoulder blades together at the end.' },
  { id: 'db_press', name: 'Dumbbell shoulder press', cat: 'strength', unit: 'reps', amount: [8, 10, 12], secPer: 3, equip: 'dumbbells',
    env: ['room', 'hostel'], cue: 'Press overhead without arching your back.' },
  { id: 'jumping_jacks', name: 'Jumping jacks', cat: 'endurance', unit: 'reps', amount: [15, 25, 40], secPer: 1.5, cv: 'jj', impact: 'high',
    env: ['room', 'hostel', 'playground', 'campus'], cue: 'Arms overhead as feet go wide. Face the camera.' },
  { id: 'high_knees', name: 'High knees', cat: 'endurance', unit: 'reps', amount: [30, 40, 60], secPer: 0.8, cv: 'knees', impact: 'high',
    env: ['room', 'hostel', 'playground', 'campus'], cue: 'Drive knees up to hip height, stay light on your feet.' },
  { id: 'mobility_flow', name: 'Mobility flow', cat: 'mobility', unit: 'sec', amount: [30, 30, 45], secPer: 1,
    env: ACTIVE, cue: 'Hip circles, arm circles, torso twists — smooth and easy.' },
  { id: 'stretch', name: 'Full-body stretch', cat: 'mobility', unit: 'sec', amount: [45, 60, 60], secPer: 1, finisher: true,
    env: ACTIVE, cue: 'Hamstrings, quads, chest and shoulders — breathe slowly.' },
  // Classroom mode: quiet, seated, zero-disruption moves (quiet: true)
  // Seated / adaptive mode: everything marked seated: true works from a chair or wheelchair, anywhere
  { id: 'posture_reset', name: 'Posture reset', cat: 'mobility', unit: 'sec', amount: [30, 30, 30], secPer: 1, quiet: true, seated: true,
    env: ['classroom'], cue: 'Sit tall, shoulder blades back and down, 5 slow breaths.' },
  { id: 'shoulder_rolls', name: 'Shoulder mobility', cat: 'mobility', unit: 'reps', amount: [10, 15, 20], secPer: 2, quiet: true, seated: true,
    env: ['classroom', 'room', 'hostel'], cue: 'Slow shoulder rolls, half forwards, half backwards.' },
  { id: 'ankle_circles', name: 'Ankle movement', cat: 'mobility', unit: 'reps', amount: [10, 15, 20], secPer: 2, quiet: true, seated: true,
    env: ['classroom'], cue: 'Circle each ankle under the desk, both directions.' },
  { id: 'seated_leg_ext', name: 'Seated leg extensions', cat: 'strength', unit: 'reps', amount: [10, 12, 15], secPer: 2, quiet: true, seated: true,
    env: ['classroom'], cue: 'Straighten one knee, hold 1 second, lower. Alternate.' },
  { id: 'neck_release', name: 'Neck release', cat: 'mobility', unit: 'sec', amount: [30, 30, 30], secPer: 1, quiet: true, seated: true,
    env: ['classroom', 'room', 'hostel'], cue: 'Ear toward shoulder, hold, switch sides. Gentle.' },
  { id: 'seated_march', name: 'Seated march', cat: 'endurance', unit: 'sec', amount: [45, 60, 60], secPer: 1, seated: true, flex: true,
    env: [], cue: 'Sit tall and lift knees alternately at a brisk pace, pump your arms.' },
  { id: 'seated_arm_raises', name: 'Seated arm raises', cat: 'strength', unit: 'reps', amount: [10, 15, 20], secPer: 2.5, cv: 'arms', seated: true,
    env: [], cue: 'Raise both arms overhead, then lower to shoulder height. Face the camera.' },
  { id: 'seated_punches', name: 'Seated punches', cat: 'endurance', unit: 'reps', amount: [20, 30, 40], secPer: 1, seated: true,
    env: [], cue: 'Fast alternating punches forward, keep your core tight.' },
  { id: 'seated_twist', name: 'Seated torso twist', cat: 'mobility', unit: 'sec', amount: [30, 30, 45], secPer: 1, quiet: true, seated: true,
    env: [], cue: 'Hands on shoulders, rotate slowly left and right from the waist.' },
  { id: 'seated_stretch', name: 'Seated full-body stretch', cat: 'mobility', unit: 'sec', amount: [45, 45, 60], secPer: 1, seated: true, seatedFinisher: true,
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

function makeItem(move, amount, label) {
  const sec = estSeconds(move, amount);
  return {
    moveId: move.id,
    name: label || move.name,
    unit: move.unit,
    target: amount,
    cv: move.cv || null,
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
  const add = (move, label) => {
    const amount = move.amount[li];
    const item = makeItem(move, amount, label);
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
  const reserve = !classroom && minutes >= 5 && finisher ? estSeconds(finisher, finisher.amount[li]) + TRANSITION : 0;

  // 3. Main block: a few distinct moves weighted toward the student's goal,
  //    repeated in rounds when there is time (a focused mission beats a long list)
  const maxMain = minutes <= 3 ? 3 : minutes <= 5 ? 4 : minutes <= 12 ? 5 : 6;
  const weight = (m) => (goal !== 'general' && m.cat === goal ? 3 : 1) * (m.cv ? 1.5 : 1);
  const mainSet = [];
  for (let guard = 0; guard < 40 && mainSet.length < maxMain; guard++) {
    const candidates = pool.filter((m) => !usedIds.has(m.id) && !m.finisher && !m.flex &&
      fits(estSeconds(m, m.amount[li]) + reserve));
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
      if (!fits(estSeconds(m, m.amount[li]) + reserve)) continue;
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
function scoreMission(mission, results, { firstToday, streakAfter, buddyMovedToday = false }) {
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
    const verified = Boolean(r.verified && item.cv);
    if (verified) verifiedCount++;
    const itemXp = Math.round(item.xp * ratio * (verified ? 1.5 : 1));
    xp += itemXp;
    activeSec += item.estSec * ratio;
    const form = Number(r.formScore);
    if (verified && Number.isFinite(form) && form >= 0 && form <= 100) {
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
  if (doneCount > 0 && firstToday && buddyMovedToday) {
    xp += 10;
    breakdown.push({ label: 'You and your buddy both moved today', xp: 10 });
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

module.exports = {
  LEVELS, ENVIRONMENTS, EQUIPMENT, GOALS, TESTS, FIT_INDIA_COMPONENTS,
  generateMission, scoreMission, levelFromAssessment, fitnessGrowth,
  fitIndiaReport, findOpportunities, toMin,
};
