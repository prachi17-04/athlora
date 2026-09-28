// Exercise demos: an animated figure for every exercise, drawn from joint angles.
// Every preview lasts exactly PREVIEW_SEC, and every still picture uses the same style,
// so demos are uniform across all exercises. Red dots = where the main effort should be felt,
// orange = supporting muscles.

export const PREVIEW_SEC = 24;
const SEG = { torso: 24, neck: 3, head: 5.5, ua: 11, fa: 10, thigh: 15, shin: 14, foot: 5 };
const GROUND = 90;
const rad = (d) => (d * Math.PI) / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const dirDown = (deg) => [Math.sin(rad(deg)), Math.cos(rad(deg))]; // 0 = straight down, +90 = forward

// ---------- side view (facing right) ----------
function sidePose(p) {
  const hip = [0, 0];
  const t = p.torso || 0;
  const sh = [Math.sin(rad(t)) * SEG.torso, -Math.cos(rad(t)) * SEG.torso];
  const ht = rad(t + (p.head || 0));
  const head = add(sh, [Math.sin(ht) * (SEG.neck + SEG.head), -Math.cos(ht) * (SEG.neck + SEG.head)]);
  const leg = (hipDeg = 0, kneeDeg = 0, toes = 0) => {
    const knee = add(hip, mul(dirDown(hipDeg), SEG.thigh));
    const phi = hipDeg - kneeDeg;
    const ankle = add(knee, mul(dirDown(phi), SEG.shin));
    const footAng = Math.atan2(-Math.sin(rad(phi)), Math.cos(rad(phi))) + rad(40 * toes);
    return { knee, ankle, toe: add(ankle, [Math.cos(footAng) * SEG.foot, Math.sin(footAng) * SEG.foot]) };
  };
  const arm = (shDeg = 0, elDeg = 0) => {
    const elbow = add(sh, mul(dirDown(shDeg), SEG.ua));
    return { elbow, wrist: add(elbow, mul(dirDown(shDeg + elDeg), SEG.fa)) };
  };
  return {
    view: 'side', hip, sh, head,
    near: { ...leg(p.nHip, p.nKnee, p.toes ?? p.nToes), ...arm(p.nSh, p.nEl) },
    far: { ...leg(p.fHip ?? p.nHip, p.fKnee ?? p.nKnee, p.toes ?? p.fToes), ...arm(p.fSh ?? p.nSh, p.fEl ?? p.nEl) },
  };
}

// ---------- front view ----------
function frontPose(p) {
  const hip = [0, 0];
  const lean = rad(p.lean || 0);
  const up = [Math.sin(lean), -Math.cos(lean)];
  const perp = [Math.cos(lean), Math.sin(lean)];
  const S = mul(up, SEG.torso);
  const w = 8 * Math.cos(rad(p.twist || 0));
  const shrug = [0, -(p.shrug || 0)];
  const lS = add(add(S, mul(perp, -w)), shrug), rS = add(add(S, mul(perp, w)), shrug);
  const ht = lean + rad(p.headTilt || 0);
  const head = add(S, [Math.sin(ht) * (SEG.neck + SEG.head), -Math.cos(ht) * (SEG.neck + SEG.head)]);
  const lH = [-4.5, 0], rH = [4.5, 0];
  // side = -1 (left, drawn on screen left) or +1
  const arm = (s, shoulder, abd = 10, el = 0) => {
    const elbow = add(shoulder, [s * Math.sin(rad(abd)) * SEG.ua, Math.cos(rad(abd)) * SEG.ua]);
    return { elbow, wrist: add(elbow, [s * Math.sin(rad(abd + el)) * SEG.fa, Math.cos(rad(abd + el)) * SEG.fa]) };
  };
  const leg = (s, h, abd = 3, flex = 0, knee = 0) => {
    const thighLen = SEG.thigh * Math.cos(rad(flex));
    const kneeP = add(h, [s * Math.sin(rad(abd)) * thighLen, Math.cos(rad(abd)) * thighLen]);
    const shinLen = SEG.shin * Math.cos(rad(flex - knee));
    const ankle = add(kneeP, [s * Math.sin(rad(abd)) * shinLen, Math.cos(rad(abd)) * shinLen]);
    return { knee: kneeP, ankle, toe: add(ankle, [s * SEG.foot * 0.8, 0]) };
  };
  return {
    view: 'front', hip, sh: S, head, lS, rS, lH, rH,
    left: { ...arm(-1, lS, p.lAbd ?? p.abd, p.lEl ?? p.el), ...leg(-1, lH, p.lLegAbd ?? p.legAbd, p.lFlex, p.lKnee) },
    right: { ...arm(1, rS, p.rAbd ?? p.abd, p.rEl ?? p.el), ...leg(1, rH, p.rLegAbd ?? p.legAbd, p.rFlex, p.rKnee) },
  };
}

// Places the figure: hip at a fixed x, lowest foot/hand on the ground (minus any jump height)
function place(pose, p) {
  const pts = [];
  const walk = (o) => { for (const v of Object.values(o)) { if (Array.isArray(v) && typeof v[0] === 'number') pts.push(v); else if (v && typeof v === 'object') walk(v); } };
  walk(pose);
  const maxY = Math.max(...pts.map((q) => q[1]), pose.head[1] + SEG.head);
  const d = [50 + (p.shiftX || 0), GROUND - maxY - (p.air || 0)];
  const shift = (o) => { for (const k of Object.keys(o)) { const v = o[k]; if (Array.isArray(v) && typeof v[0] === 'number') o[k] = add(v, d); else if (v && typeof v === 'object') shift(v); } };
  shift(pose);
  return pose;
}

// ---------- exercise library (poses, props, where to feel it) ----------
const SEATED = { nHip: 90, nKnee: 90, fHip: 90, fKnee: 90 };
const SEATED_F = { lFlex: 90, lKnee: 90, rFlex: 90, rKnee: 90, legAbd: 6 };
const WALK_A = { nHip: 25, nKnee: 5, fHip: -20, fKnee: 25, nSh: -25, fSh: 25, nEl: 25, fEl: 25 };
const WALK_B = { nHip: -20, nKnee: 25, fHip: 25, fKnee: 5, nSh: 25, fSh: -25, nEl: 25, fEl: 25 };
const f = (p, d = 0.9) => ({ p, d });

export const DEMOS = {
  squats: { view: 'side', frames: [f({ nSh: 10 }), f({ torso: 35, nHip: 95, nKnee: 105, nSh: 85 })], feel: [['nThigh', 'high'], ['glute', 'high'], ['core', 'mid']] },
  chair_squats: { view: 'side', props: ['chairBehind'], frames: [f({}), f({ torso: 25, nHip: 88, nKnee: 90, nSh: 80 }, 1.1)], feel: [['nThigh', 'high'], ['glute', 'high'], ['core', 'mid']] },
  lunges: { view: 'side', frames: [f({ nHip: 18, fHip: -18 }), f({ nHip: 80, nKnee: 85, fHip: -25, fKnee: 100 }, 1.1)], feel: [['nThigh', 'high'], ['glute', 'high'], ['fThigh', 'mid']] },
  wall_pushups: { view: 'side', props: ['wall'], frames: [f({ torso: 25, nHip: -25, nSh: 98 }), f({ torso: 38, nHip: -38, nSh: 60, nEl: 80 }, 1.1)], feel: [['chest', 'high'], ['triceps', 'mid'], ['core', 'mid']] },
  // Up: body angled so straight arms reach the floor; down: body near-level, elbows bent
  pushups: { view: 'side', frames: [f({ torso: 71, nHip: -71, nSh: 2 }), f({ torso: 85, nHip: -85, nSh: -45, nEl: 60 }, 1.1)], feel: [['chest', 'high'], ['triceps', 'high'], ['core', 'mid']] },
  // Hands on the chair seat behind; hips drop in front of it as the elbows bend
  chair_dips: { view: 'side', props: ['chairBehind'], frames: [f({ nHip: 90, nKnee: 90, nSh: -32, nEl: 0 }), f({ nHip: 115, nKnee: 115, nSh: -62, nEl: 70 }, 1.1)], feel: [['triceps', 'high'], ['chest', 'mid'], ['shoulder', 'mid']] },
  plank: { view: 'side', frames: [f({ torso: 80, nHip: -80, nSh: 0, nEl: 90 }, 1.6), f({ torso: 81, nHip: -81, nSh: 0, nEl: 90 }, 1.6)], feel: [['core', 'high'], ['shoulder', 'mid'], ['glute', 'mid']] },
  calf_raises: { view: 'side', frames: [f({ toes: 0 }, 0.8), f({ toes: 1 }, 0.8)], feel: [['nCalf', 'high'], ['fCalf', 'high']] },
  band_rows: { view: 'side', props: ['band'], frames: [f({ torso: 10, nSh: 85, nKnee: 10 }), f({ torso: 10, nSh: -15, nEl: 100, nKnee: 10 }, 1)], feel: [['upperBack', 'high'], ['biceps', 'mid']] },
  db_press: { view: 'front', props: ['dumbbells'], frames: [f({ abd: 90, el: 90 }), f({ abd: 170, el: 10 }, 1)], feel: [['shoulders', 'high'], ['triceps', 'mid']] },
  jumping_jacks: { view: 'front', frames: [f({ abd: 15, legAbd: 3 }, 0.25), f({ abd: 90, legAbd: 10, air: 4 }, 0.25), f({ abd: 165, legAbd: 18 }, 0.25), f({ abd: 90, legAbd: 10, air: 4 }, 0.25)], feel: [['calves', 'mid'], ['shoulders', 'mid'], ['quads', 'mid']] },
  high_knees: { view: 'front', frames: [f({ lFlex: 90, lKnee: 90, abd: 20, el: 110 }, 0.3), f({ rFlex: 90, rKnee: 90, abd: 20, el: 110 }, 0.3)], feel: [['hipFlexors', 'high'], ['core', 'mid'], ['calves', 'mid']] },
  march: { view: 'front', frames: [f({ lFlex: 60, lKnee: 70, abd: 15, el: 90 }, 0.5), f({ rFlex: 60, rKnee: 70, abd: 15, el: 90 }, 0.5)], feel: [['hipFlexors', 'mid'], ['calves', 'mid']] },
  brisk_walk: { view: 'side', frames: [f(WALK_A, 0.5), f(WALK_B, 0.5)], feel: [['nCalf', 'mid'], ['glute', 'mid'], ['nThigh', 'mid']] },
  stairs: { view: 'side', props: ['stairs'], frames: [f({ torso: 10, nHip: 60, nKnee: 75, fHip: -10, nSh: -20, fSh: 20 }, 0.6), f({ torso: 10, fHip: 60, fKnee: 75, nHip: -10, nSh: 20, fSh: -20 }, 0.6)], feel: [['glute', 'high'], ['nThigh', 'high'], ['nCalf', 'mid']] },
  mobility_flow: { view: 'front', frames: [f({ abd: 90 }, 1), f({ abd: 170 }, 1), f({ lean: -15, lAbd: 170, rAbd: 60 }, 1), f({ lean: 15, rAbd: 170, lAbd: 60 }, 1), f({ twist: 55, abd: 90 }, 1)], feel: [['shoulders', 'mid'], ['obliques', 'mid']] },
  stretch: { view: 'front', frames: [f({ abd: 175 }, 1.5), f({ lean: -18, rAbd: 170, lAbd: 20 }, 1.5), f({ abd: 175 }, 1.5), f({ lean: 18, lAbd: 170, rAbd: 20 }, 1.5)], feel: [['obliques', 'high'], ['shoulders', 'mid']] },
  posture_reset: { view: 'side', props: ['chairSeat'], frames: [f({ ...SEATED, torso: -12, head: 30, nSh: 20, nEl: 60 }, 1.5), f({ ...SEATED, torso: 0, head: 0, nSh: -10, nEl: 70 }, 1.5)], feel: [['upperBack', 'high'], ['neck', 'mid']] },
  shoulder_rolls: { view: 'front', props: ['chairFront'], frames: [f({ ...SEATED_F, shrug: 0 }, 0.6), f({ ...SEATED_F, shrug: 3.5 }, 0.6), f({ ...SEATED_F, shrug: 1.5, twist: 12 }, 0.6)], feel: [['shoulders', 'high'], ['upperBackF', 'mid']] },
  ankle_circles: { view: 'side', props: ['chairSeat'], frames: [f({ ...SEATED, nKnee: 60, toes: 0 }, 0.5), f({ ...SEATED, nKnee: 60, nToes: 1 }, 0.5), f({ ...SEATED, nKnee: 60, nToes: -0.8 }, 0.5)], feel: [['nAnkle', 'high'], ['nCalf', 'mid']] },
  seated_leg_ext: { view: 'side', props: ['chairSeat'], frames: [f({ ...SEATED }, 0.9), f({ ...SEATED, nKnee: 5 }, 1.2), f({ ...SEATED }, 0.9), f({ ...SEATED, fKnee: 5 }, 1.2)], feel: [['nThigh', 'high']] },
  neck_release: { view: 'front', props: ['chairFront'], frames: [f({ ...SEATED_F, headTilt: -30 }, 1.6), f({ ...SEATED_F }, 1), f({ ...SEATED_F, headTilt: 30 }, 1.6), f({ ...SEATED_F }, 1)], feel: [['neck', 'high'], ['shoulders', 'mid']] },
  seated_march: { view: 'side', props: ['chairSeat'], frames: [f({ ...SEATED, nHip: 115, nSh: 30, fSh: -20, nEl: 80, fEl: 80 }, 0.45), f({ ...SEATED, fHip: 115, nSh: -20, fSh: 30, nEl: 80, fEl: 80 }, 0.45)], feel: [['hipFlexorSide', 'high'], ['core', 'mid']] },
  seated_arm_raises: { view: 'front', props: ['chairFront'], frames: [f({ ...SEATED_F, abd: 20 }, 1), f({ ...SEATED_F, abd: 175 }, 1)], feel: [['shoulders', 'high'], ['upperBackF', 'mid']] },
  seated_punches: { view: 'side', props: ['chairSeat'], frames: [f({ ...SEATED, nSh: 90, nEl: 0, fSh: 20, fEl: 120 }, 0.35), f({ ...SEATED, fSh: 90, fEl: 0, nSh: 20, nEl: 120 }, 0.35)], feel: [['shoulder', 'mid'], ['triceps', 'mid'], ['core', 'mid']] },
  seated_twist: { view: 'front', props: ['chairFront'], frames: [f({ ...SEATED_F, twist: 60, abd: 40, el: 140 }, 1.3), f({ ...SEATED_F, twist: -60, abd: 40, el: 140 }, 1.3)], feel: [['obliques', 'high']] },
  seated_stretch: { view: 'front', props: ['chairFront'], frames: [f({ ...SEATED_F, abd: 175 }, 1.5), f({ ...SEATED_F, lean: -16, rAbd: 170, lAbd: 20 }, 1.5), f({ ...SEATED_F, lean: 16, lAbd: 170, rAbd: 20 }, 1.5)], feel: [['obliques', 'mid'], ['shoulders', 'mid']] },
  // Assessment-only movements
  fold: { view: 'side', frames: [f({}, 1.2), f({ torso: 105, head: -10 }, 1.8)], feel: [['hamstring', 'high'], ['lowerBack', 'mid']] },
  balance: { view: 'front', frames: [f({ rFlex: 60, rKnee: 90, abd: 80, lean: -2 }, 1.2), f({ rFlex: 60, rKnee: 90, abd: 80, lean: 2 }, 1.2)], feel: [['core', 'high'], ['lCalf', 'mid'], ['glutes', 'mid']] },
};

export const FEEL_LABELS = {
  nThigh: 'Front thighs', fThigh: 'Back leg thigh', quads: 'Front thighs', glute: 'Glutes', glutes: 'Glutes', core: 'Core',
  chest: 'Chest', triceps: 'Back of arms', biceps: 'Front of arms', shoulder: 'Shoulders', shoulders: 'Shoulders',
  upperBack: 'Upper back', upperBackF: 'Upper back', nCalf: 'Calves', fCalf: 'Calves', calves: 'Calves', lCalf: 'Standing calf',
  hipFlexors: 'Hip flexors', hipFlexorSide: 'Hip flexors', obliques: 'Side of waist', neck: 'Neck', nAnkle: 'Ankles',
  hamstring: 'Back of thighs', lowerBack: 'Lower back',
};

// Assessment tests use the matching exercise demo
export const TEST_DEMO = { squats: 'squats', pushups: 'pushups', jumpingJacks: 'jumping_jacks', plankSec: 'plank', flexibility: 'fold', balanceSec: 'balance', armRaises: 'seated_arm_raises' };

export const hasDemo = (id) => Boolean(DEMOS[id]);

// Pose parameters at time t (seconds): eased interpolation around the keyframe loop
export function paramsAt(demo, t) {
  const frames = demo.frames;
  const cycle = frames.reduce((s, fr) => s + fr.d, 0);
  let x = ((t % cycle) + cycle) % cycle;
  let i = 0;
  while (x > frames[i].d) { x -= frames[i].d; i++; }
  const a = frames[i].p, b = frames[(i + 1) % frames.length].p;
  const k = 0.5 - Math.cos(Math.PI * (x / frames[i].d)) / 2; // ease in-out
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = {};
  for (const key of keys) out[key] = (a[key] ?? 0) + ((b[key] ?? 0) - (a[key] ?? 0)) * k;
  return { params: out, rep: Math.floor(t / cycle) + 1, cycle };
}

export function buildPose(demo, params) {
  const pose = demo.view === 'front' ? frontPose(params) : sidePose(params);
  return place(pose, params);
}

// Where to draw the "feel it here" dots
function feelPoints(pose, name) {
  if (pose.view === 'side') {
    const u = unit(sub(pose.sh, pose.hip));
    const n = [-u[1], u[0]]; // front of the body
    const n2 = [u[1], -u[0]];
    const along = (a, b, t) => lerp(a, b, t);
    const N = pose.near, F = pose.far;
    const thighN = unit(sub(N.knee, pose.hip)), shinN = unit(sub(N.ankle, N.knee));
    const P = {
      nThigh: add(along(pose.hip, N.knee, 0.5), mul([thighN[1], -thighN[0]], 1.2)),
      fThigh: along(pose.hip, F.knee, 0.5),
      glute: add(pose.hip, mul(n2, 2.8)),
      core: add(along(pose.hip, pose.sh, 0.4), mul(n, 2.2)),
      chest: add(along(pose.hip, pose.sh, 0.82), mul(n, 2.6)),
      upperBack: add(along(pose.hip, pose.sh, 0.8), mul(n2, 2.6)),
      lowerBack: add(along(pose.hip, pose.sh, 0.25), mul(n2, 2.4)),
      triceps: along(pose.sh, N.elbow, 0.5),
      biceps: along(pose.sh, N.elbow, 0.55),
      shoulder: pose.sh,
      neck: lerp(pose.sh, pose.head, 0.35),
      nCalf: add(along(N.knee, N.ankle, 0.4), mul([-shinN[1], shinN[0]], 1.4)),
      fCalf: along(F.knee, F.ankle, 0.4),
      nAnkle: N.ankle,
      hamstring: add(along(pose.hip, N.knee, 0.5), mul([-thighN[1], thighN[0]], 1.4)),
      hipFlexorSide: add(pose.hip, mul(n, 2.4)),
    };
    return P[name] ? [P[name]] : [];
  }
  const L = pose.left, R = pose.right;
  const mid = (a, b) => lerp(a, b, 0.5);
  const P = {
    quads: [mid(pose.lH, L.knee), mid(pose.rH, R.knee)],
    calves: [lerp(L.knee, L.ankle, 0.4), lerp(R.knee, R.ankle, 0.4)],
    lCalf: [lerp(L.knee, L.ankle, 0.4)],
    shoulders: [pose.lS, pose.rS],
    triceps: [mid(pose.lS, L.elbow), mid(pose.rS, R.elbow)],
    core: [lerp(pose.hip, pose.sh, 0.42)],
    obliques: [lerp(pose.lH, pose.lS, 0.45), lerp(pose.rH, pose.rS, 0.45)],
    hipFlexors: [add(pose.lH, [0, 1.5]), add(pose.rH, [0, 1.5])],
    glutes: [add(pose.lH, [-1, 1]), add(pose.rH, [1, 1])],
    upperBackF: [lerp(mid(pose.lS, pose.rS), pose.hip, 0.2)],
    neck: [lerp(pose.sh, pose.head, 0.4)],
  };
  return P[name] || [];
}

// ---------- SVG drawing ----------
const C = { body: '#3fb4ff', far: 'rgba(63,180,255,.38)', prop: '#3a5578', ground: '#1f3552', high: '#ff4d4d', mid: '#ff9f1c' };
const ln = (a, b, w, c) => `<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;

function drawProps(demo, pose) {
  const out = [];
  for (const prop of demo.props || []) {
    if (prop === 'wall') out.push(ln([82, 18], [82, GROUND], 2.5, C.prop));
    if (prop === 'chairBehind') {
      const x = 50 - 13, seatY = GROUND - 16;
      out.push(ln([x - 4, seatY], [x + 7, seatY], 2.2, C.prop), ln([x - 4, seatY], [x - 4, seatY - 17], 2, C.prop),
        ln([x - 4, seatY], [x - 4, GROUND], 1.6, C.prop), ln([x + 7, seatY], [x + 7, GROUND], 1.6, C.prop));
    }
    if (prop === 'chairSeat') {
      const h = pose.hip, seatY = h[1] + 2.5;
      out.push(ln([h[0] - 7, seatY], [h[0] + 6, seatY], 2.2, C.prop), ln([h[0] - 7, seatY], [h[0] - 7, seatY - 20], 2, C.prop),
        ln([h[0] - 6, seatY], [h[0] - 6, GROUND], 1.6, C.prop), ln([h[0] + 5, seatY], [h[0] + 5, GROUND], 1.6, C.prop));
    }
    if (prop === 'chairFront') {
      const seatY = pose.hip[1] + 2;
      out.push(`<rect x="38" y="${seatY.toFixed(1)}" width="24" height="3" rx="1.2" fill="${C.prop}"/>`,
        ln([40, seatY + 3], [40, GROUND], 1.6, C.prop), ln([60, seatY + 3], [60, GROUND], 1.6, C.prop));
    }
    if (prop === 'band') {
      out.push(ln(pose.near.wrist, [92, pose.sh[1] + 4], 1.2, '#ff9f1c'), ln([92, pose.sh[1] - 2], [92, GROUND], 2, C.prop));
    }
    if (prop === 'dumbbells') {
      for (const w of [pose.left.wrist, pose.right.wrist]) out.push(`<rect x="${(w[0] - 4).toFixed(1)}" y="${(w[1] - 1.6).toFixed(1)}" width="8" height="3.2" rx="1" fill="${C.prop}"/>`);
    }
    if (prop === 'stairs') {
      // Two steps rising in front of the figure
      out.push(`<polyline points="54,${GROUND} 54,${GROUND - 7} 70,${GROUND - 7} 70,${GROUND - 14} 90,${GROUND - 14}" fill="none" stroke="${C.prop}" stroke-width="2"/>`);
    }
  }
  return out.join('');
}

function drawFigure(pose) {
  const o = [];
  if (pose.view === 'side') {
    const limb = (L, c, w) => [ln(pose.hip, L.knee, w, c), ln(L.knee, L.ankle, w, c), ln(L.ankle, L.toe, w * 0.8, c)];
    const armL = (L, c, w) => [ln(pose.sh, L.elbow, w * 0.9, c), ln(L.elbow, L.wrist, w * 0.85, c)];
    o.push(...limb(pose.far, C.far, 3), ...armL(pose.far, C.far, 3));
    o.push(ln(pose.hip, pose.sh, 4.2, C.body));
    o.push(...limb(pose.near, C.body, 3.4), ...armL(pose.near, C.body, 3.4));
  } else {
    for (const s of ['left', 'right']) {
      const L = pose[s], h = s === 'left' ? pose.lH : pose.rH, shp = s === 'left' ? pose.lS : pose.rS;
      o.push(ln(h, L.knee, 3.4, C.body), ln(L.knee, L.ankle, 3.2, C.body), ln(L.ankle, L.toe, 2.6, C.body));
      o.push(ln(shp, L.elbow, 3, C.body), ln(L.elbow, L.wrist, 2.8, C.body));
    }
    o.push(ln(pose.lH, pose.rH, 3.4, C.body), ln(pose.lS, pose.rS, 3.4, C.body));
    o.push(ln(lerp(pose.lH, pose.rH, 0.5), lerp(pose.lS, pose.rS, 0.5), 4.2, C.body));
  }
  o.push(`<circle cx="${pose.head[0].toFixed(2)}" cy="${pose.head[1].toFixed(2)}" r="${SEG.head}" fill="${C.body}"/>`);
  return o.join('');
}

function drawFeel(demo, pose, pulse) {
  return demo.feel.map(([name, level]) => feelPoints(pose, name).map((q) => {
    const col = level === 'high' ? C.high : C.mid;
    const r = (level === 'high' ? 3.1 : 2.5) * (1 + 0.18 * pulse);
    return `<circle cx="${q[0].toFixed(2)}" cy="${q[1].toFixed(2)}" r="${(r * 1.9).toFixed(2)}" fill="${col}" opacity="${(0.22 + 0.12 * pulse).toFixed(2)}"/>` +
      `<circle cx="${q[0].toFixed(2)}" cy="${q[1].toFixed(2)}" r="${r.toFixed(2)}" fill="${col}" stroke="#fff" stroke-width="0.7"/>`;
  }).join('')).join('');
}

/** SVG markup for an exercise at time t (seconds). */
export function frameSVG(id, t = null, { pulse = 0 } = {}) {
  const demo = DEMOS[id];
  if (!demo) return '';
  // Stills show the "effort" pose: the second keyframe
  const params = t === null ? demo.frames[1 % demo.frames.length].p : paramsAt(demo, t).params;
  const pose = buildPose(demo, params);
  return `<line x1="4" y1="${GROUND + 0.8}" x2="96" y2="${GROUND + 0.8}" stroke="${C.ground}" stroke-width="1.4"/>` +
    drawProps(demo, pose) + drawFigure(pose) + drawFeel(demo, pose, pulse);
}

/** Uniform still picture of an exercise (used for thumbnails and the round badge). */
export function stillSVG(id, className = 'demo-still') {
  if (!DEMOS[id]) return '';
  return `<svg class="${className}" viewBox="0 0 100 100" role="img" aria-label="Exercise picture">${frameSVG(id)}</svg>`;
}

export function feelLegend(id) {
  const d = DEMOS[id];
  if (!d) return '';
  const seen = new Set();
  return d.feel.filter(([n]) => { const l = FEEL_LABELS[n]; if (seen.has(l)) return false; seen.add(l); return true; })
    .map(([n, level]) => `<span class="feel-tag"><i style="background:${level === 'high' ? C.high : C.mid}"></i>${FEEL_LABELS[n]}</span>`).join('');
}

/**
 * Full-screen 24-second preview. Resolves when closed; resolves 'start' if the student taps "Start exercise".
 */
export function openPreview(id, { title, cue, startLabel = 'Start exercise' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'demo-overlay';
    overlay.innerHTML = `
      <div class="demo-sheet">
        <div class="row between"><span class="upper">Preview · ${PREVIEW_SEC} s</span><button class="link" id="dClose" style="color:var(--muted)">Close ✕</button></div>
        <h2 class="mt-8">${title || ''}</h2>
        <div class="demo-stage"><svg viewBox="0 0 100 100" id="dSvg" role="img" aria-label="Exercise demonstration"></svg>
          <div class="demo-rep" id="dRep"></div></div>
        <div class="bar mt-8"><div id="dBar" style="width:0%;transition:none"></div></div>
        <div class="row between tiny muted mt-8"><span id="dTime">0:00</span><span>0:${PREVIEW_SEC}</span></div>
        ${cue ? `<p class="small mt-8">${cue}</p>` : ''}
        <p class="upper mt-16">Feel it here</p>
        <div class="feel-legend mt-8">${feelLegend(id)}</div>
        <p class="tiny muted mt-8">🔴 main muscles &nbsp; 🟠 supporting muscles</p>
        <div class="grid-2 mt-16">
          <button class="btn ghost" id="dReplay">↺ Replay</button>
          <button class="btn primary" id="dStart">${startLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    const svg = overlay.querySelector('#dSvg');
    let start = performance.now(), raf = 0, closed = false;
    const loop = () => {
      const t = Math.min(PREVIEW_SEC, (performance.now() - start) / 1000);
      svg.innerHTML = frameSVG(id, t, { pulse: (Math.sin(t * 4) + 1) / 2 });
      const { rep } = paramsAt(DEMOS[id], t);
      overlay.querySelector('#dRep').textContent = `Rep ${rep}`;
      overlay.querySelector('#dBar').style.width = `${(t / PREVIEW_SEC) * 100}%`;
      overlay.querySelector('#dTime').textContent = `0:${String(Math.floor(t)).padStart(2, '0')}`;
      if (t < PREVIEW_SEC && !closed) raf = requestAnimationFrame(loop);
    };
    const close = (result) => {
      closed = true;
      cancelAnimationFrame(raf);
      overlay.remove();
      document.body.style.overflow = '';
      resolve(result);
    };
    overlay.querySelector('#dClose').onclick = () => close(null);
    overlay.querySelector('#dStart').onclick = () => close('start');
    overlay.querySelector('#dReplay').onclick = () => { cancelAnimationFrame(raf); start = performance.now(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  });
}
