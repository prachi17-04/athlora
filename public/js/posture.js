// Posture analysis for a seated student facing a laptop/phone camera. Pure functions (tested without a camera).
// Landmarks: 0 nose, 11/12 shoulders. Coordinates in pixels.

const vis = (p) => p && (p.visibility ?? 1) > 0.5;

export function measure(lm, W, H) {
  if (!lm) return null;
  const nose = lm[0], ls = lm[11], rs = lm[12];
  if (!vis(nose) || !vis(ls) || !vis(rs)) return null;
  const n = { x: nose.x * W, y: nose.y * H }, l = { x: ls.x * W, y: ls.y * H }, r = { x: rs.x * W, y: rs.y * H };
  const shoulderW = Math.hypot(l.x - r.x, l.y - r.y) || 1;
  const shoulderY = (l.y + r.y) / 2;
  return {
    // how high the head sits above the shoulders, relative to shoulder width (drops when slouching)
    head: (shoulderY - n.y) / shoulderW,
    // apparent shoulder width grows when leaning in toward the screen
    width: shoulderW,
    // shoulder line tilt in degrees
    tilt: (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI,
  };
}

// Average several measurements taken while the student sits up straight
export function calibrate(samples) {
  const ok = samples.filter(Boolean);
  if (ok.length < 3) return null;
  const avg = (k) => ok.reduce((s, m) => s + m[k], 0) / ok.length;
  return { head: avg('head'), width: avg('width'), tilt: avg('tilt') };
}

const tiltDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// Classify one measurement against the student's own baseline
export function classify(m, base) {
  if (!m) return 'away';
  if (m.width > base.width * 1.2) return 'leaning';
  if (m.head < base.head * 0.8) return 'slouching';
  if (tiltDiff(m.tilt, base.tilt) > 8) return 'tilted';
  return 'good';
}

export const STATUS = {
  good: { label: 'Good posture', icon: '✓', color: 'var(--accent)', tip: 'Nice, keep it up.' },
  slouching: { label: 'Slouching', icon: '⚠', color: 'var(--warn)', tip: 'Sit tall and lift your chest. Head over shoulders.' },
  leaning: { label: 'Too close to the screen', icon: '⚠', color: 'var(--warn)', tip: 'Lean back a little, your eyes will thank you.' },
  tilted: { label: 'Leaning to one side', icon: '⚠', color: 'var(--warn)', tip: 'Level your shoulders and sit evenly on both hips.' },
  away: { label: 'Not in view', icon: '…', color: 'var(--muted)', tip: 'Paused while you are away from the camera.' },
};
