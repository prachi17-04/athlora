// Real-time computer-vision exercise verification (runs fully in the browser).
// MediaPipe Pose Landmarker -> joint angles -> rep / hold counters.
// Video never leaves the device.

const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarkerPromise = null;
export function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import(`${CDN}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const make = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      try { return await make('GPU'); } catch { return await make('CPU'); }
    })().catch((err) => { landmarkerPromise = null; throw err; });
  }
  return landmarkerPromise;
}

// ---------- geometry ----------
const L = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
const SIDES = {
  left: { sh: L.ls, el: L.le, wr: L.lw, hip: L.lh, knee: L.lk, ankle: L.la },
  right: { sh: L.rs, el: L.re, wr: L.rw, hip: L.rh, knee: L.rk, ankle: L.ra },
};

function angle(a, b, c) {
  const ab = Math.atan2(a.y - b.y, a.x - b.x);
  const cb = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs((ab - cb) * 180 / Math.PI);
  return d > 180 ? 360 - d : d;
}

function bestSide(P, keys) {
  const score = (s) => keys.reduce((sum, k) => sum + P(SIDES[s][k]).v, 0);
  return SIDES[score('left') >= score('right') ? 'left' : 'right'];
}

const visible = (...pts) => pts.every((p) => p.v > 0.5);

// ---------- form quality ----------
// Maps a measurement onto 40..100: `bad` or worse -> 40, `good` or better -> 100 (works in either direction)
function grade(v, bad, good) {
  const t = Math.max(0, Math.min(1, (v - bad) / (good - bad)));
  return Math.round(40 + t * 60);
}
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Collects per-rep component scores; summary = average score + a tip for the weakest component
function formTracker(tips) {
  const reps = [];
  return {
    add(parts) {
      const clean = Object.fromEntries(Object.entries(parts).filter(([, v]) => Number.isFinite(v)));
      const score = Math.round(avg(Object.values(clean)));
      reps.push({ score, parts: clean });
      return score;
    },
    get last() { return reps.length ? reps[reps.length - 1].score : null; },
    get summary() {
      if (!reps.length) return null;
      let weakest = null;
      for (const k of Object.keys(tips)) {
        const vals = reps.map((r) => r.parts[k]).filter((v) => v !== undefined);
        if (!vals.length) continue;
        const a = avg(vals);
        if (!weakest || a < weakest.a) weakest = { k, a };
      }
      const tip = weakest && weakest.a < 85
        ? (typeof tips[weakest.k] === 'function' ? tips[weakest.k]() : tips[weakest.k])
        : 'Great technique — keep it up!';
      return { score: Math.round(avg(reps.map((r) => r.score))), tip, reps: reps.length };
    },
  };
}

// ---------- counters ----------
// Each counter: update(P, dt, now) -> { tracking, rep?, msg }, plus `count` and `form` (summary or null)
function squatCounter() {
  let state = 'up', count = 0, minAngle = 180;
  let rep = null; // { start, min, asym }
  const form = formTracker({
    depth: 'Go deeper — aim for thighs parallel to the floor.',
    tempo: 'Slow down — take about a second on the way down.',
    symmetry: 'Keep your weight even on both legs.',
  });
  return {
    get count() { return count; },
    get minAngle() { return minAngle; },
    get formLast() { return form.last; },
    get form() { return form.summary; },
    update(P, dt, now) {
      const s = bestSide(P, ['hip', 'knee', 'ankle']);
      const hip = P(s.hip), knee = P(s.knee), ankle = P(s.ankle);
      if (!visible(hip, knee, ankle)) return { tracking: false, msg: 'Step back so your hips, knees and ankles are visible' };
      const a = angle(hip, knee, ankle);
      if (a >= 40) minAngle = Math.min(minAngle, a);

      // Left/right knee difference, when both legs are visible (front-facing)
      const lh = P(L.lh), lk = P(L.lk), la = P(L.la), rh = P(L.rh), rk = P(L.rk), ra = P(L.ra);
      const asym = visible(lh, lk, la, rh, rk, ra) ? Math.abs(angle(lh, lk, la) - angle(rh, rk, ra)) : null;

      if (!rep && a < 150) rep = { start: now, min: a, asym };
      if (rep && a < rep.min) { rep.min = a; rep.asym = asym; }
      if (state === 'up' && a < 110) state = 'down';
      else if (state === 'down' && a > 155) {
        state = 'up';
        count++;
        const score = form.add({
          depth: grade(rep.min, 130, 95),
          tempo: grade((now - rep.start) / 1000, 0.6, 1.4),
          symmetry: rep.asym === null ? undefined : grade(rep.asym, 30, 8),
        });
        rep = null;
        return { tracking: true, rep: true, msg: score >= 80 ? 'Great rep!' : 'Rep counted — check your form' };
      } else if (state === 'up' && a > 155) rep = null;
      return { tracking: true, msg: state === 'down' ? 'Good depth — drive up' : a < 140 ? 'Lower…' : 'Squat down' };
    },
  };
}

function pushupCounter() {
  let state = 'up', count = 0;
  let rep = null; // { start, minElbow, minLine }
  const form = formTracker({
    depth: 'Lower your chest further — elbows to about 90°.',
    line: "Keep your body in one straight line — don't let your hips sag.",
    tempo: "Control the movement — don't rush.",
  });
  return {
    get count() { return count; },
    get formLast() { return form.last; },
    get form() { return form.summary; },
    update(P, dt, now) {
      const s = bestSide(P, ['sh', 'el', 'wr']);
      const sh = P(s.sh), el = P(s.el), wr = P(s.wr), hip = P(s.hip), ankle = P(s.ankle);
      if (!visible(sh, el, wr)) return { tracking: false, msg: 'Turn side-on so your shoulder, elbow and wrist are visible' };
      const a = angle(sh, el, wr);
      const line = visible(hip, ankle) ? angle(sh, hip, ankle) : null;
      if (!rep && a < 145) rep = { start: now, minElbow: a, minLine: line };
      if (rep) {
        rep.minElbow = Math.min(rep.minElbow, a);
        if (line !== null) rep.minLine = rep.minLine === null ? line : Math.min(rep.minLine, line);
      }
      if (state === 'up' && a < 100) state = 'down';
      else if (state === 'down' && a > 150) {
        state = 'up';
        count++;
        const score = form.add({
          depth: grade(rep.minElbow, 125, 90),
          line: rep.minLine === null ? undefined : grade(rep.minLine, 140, 165),
          tempo: grade((now - rep.start) / 1000, 0.6, 1.3),
        });
        rep = null;
        return { tracking: true, rep: true, msg: score >= 80 ? 'Great rep!' : 'Rep counted — check your form' };
      } else if (state === 'up' && a > 150) rep = null;
      return { tracking: true, msg: state === 'down' ? 'Push back up' : a < 130 ? 'Lower…' : 'Bend your elbows' };
    },
  };
}

function jackCounter() {
  let state = 'closed', count = 0;
  let rep = { arms: 0, feet: 0 };
  const form = formTracker({
    arms: 'Bring your arms all the way overhead.',
    feet: 'Jump your feet wider.',
  });
  return {
    get count() { return count; },
    get formLast() { return form.last; },
    get form() { return form.summary; },
    update(P) {
      const nose = P(L.nose), ls = P(L.ls), rs = P(L.rs), lw = P(L.lw), rw = P(L.rw), la = P(L.la), ra = P(L.ra);
      if (!visible(ls, rs, lw, rw, la, ra)) return { tracking: false, msg: 'Face the camera with your whole body in frame' };
      const shoulderW = Math.abs(ls.x - rs.x) || 1;
      const feet = Math.abs(la.x - ra.x);
      const handsUp = lw.y < ls.y && rw.y < rs.y;
      const handsDown = lw.y > ls.y && rw.y > rs.y;
      // Arm height relative to shoulder->nose distance (1 = wrists at nose level)
      const headH = Math.max(1, (ls.y + rs.y) / 2 - nose.y);
      rep.arms = Math.max(rep.arms, ((ls.y + rs.y) / 2 - Math.max(lw.y, rw.y)) / headH);
      rep.feet = Math.max(rep.feet, feet / shoulderW);
      if (state === 'closed' && handsUp && feet > shoulderW * 1.1) state = 'open';
      else if (state === 'open' && handsDown) {
        state = 'closed';
        count++;
        form.add({ arms: grade(rep.arms, 0.3, 1.4), feet: grade(rep.feet, 1.1, 1.8) });
        rep = { arms: 0, feet: 0 };
        return { tracking: true, rep: true, msg: 'Keep going!' };
      }
      return { tracking: true, msg: state === 'open' ? 'Arms down, feet together' : 'Arms up, feet wide' };
    },
  };
}

function kneesCounter() {
  const st = { left: 'down', right: 'down' };
  const peak = { left: 1, right: 1 };
  let count = 0;
  const form = formTracker({ height: 'Lift your knees higher — up to hip height.' });
  return {
    get count() { return count; },
    get formLast() { return form.last; },
    get form() { return form.summary; },
    update(P) {
      const ls = P(L.ls), rs = P(L.rs), lh = P(L.lh), rh = P(L.rh), lk = P(L.lk), rk = P(L.rk);
      if (!visible(ls, rs, lh, rh, lk, rk)) return { tracking: false, msg: 'Face the camera, hips and knees in frame' };
      const torso = Math.abs((lh.y + rh.y) / 2 - (ls.y + rs.y) / 2) || 1;
      let rep = false;
      for (const [side, hip, knee] of [['left', lh, lk], ['right', rh, rk]]) {
        const lift = (knee.y - hip.y) / torso; // smaller = higher knee
        if (st[side] === 'up') peak[side] = Math.min(peak[side], lift);
        if (st[side] === 'down' && lift < 0.4) { st[side] = 'up'; count++; rep = true; peak[side] = lift; }
        else if (st[side] === 'up' && lift > 0.6) {
          st[side] = 'down';
          form.add({ height: grade(peak[side], 0.4, 0.05) });
        }
      }
      return { tracking: true, rep, msg: 'Drive those knees up!' };
    },
  };
}

function plankCounter() {
  let held = 0, lastGood = 0, sag = 0, pike = 0, sinceSample = 0;
  const form = formTracker({ line: () => (sag >= pike ? 'Lift your hips slightly — they are sagging.' : 'Lower your hips — keep one straight line.') });
  return {
    get count() { return Math.floor(held); },
    get held() { return held; },
    get lastGood() { return lastGood; },
    get formLast() { return form.last; },
    get form() { return form.summary; },
    update(P, dt, now) {
      const s = bestSide(P, ['sh', 'hip', 'ankle']);
      const sh = P(s.sh), hip = P(s.hip), ankle = P(s.ankle);
      if (!visible(sh, hip, ankle)) return { tracking: false, msg: 'Turn side-on so your whole body is visible' };
      const body = angle(sh, hip, ankle);
      const straight = body > 150;
      const flat = Math.abs(sh.y - ankle.y) < Math.abs(sh.x - ankle.x) * 0.6;
      if (straight && flat) {
        held += dt;
        lastGood = now;
        // Is the hip below (sag) or above (pike) the shoulder-ankle line?
        const t = (hip.x - sh.x) / ((ankle.x - sh.x) || 1);
        const lineY = sh.y + t * (ankle.y - sh.y);
        if (hip.y > lineY) sag++; else pike++;
        sinceSample += dt;
        if (sinceSample >= 1) { sinceSample = 0; form.add({ line: grade(body, 152, 172) }); }
        return { tracking: true, msg: body > 165 ? 'Perfect line — hold it' : 'Holding — straighten a little more' };
      }
      return { tracking: true, msg: !flat ? 'Get into plank position' : 'Straighten your hips' };
    },
  };
}

// Seated arm raises (adaptive mode): both wrists overhead, then back below the shoulders
function armsCounter() {
  let state = 'down', count = 0, rep = { height: 0, diff: 0 };
  const form = formTracker({
    height: 'Reach all the way up overhead.',
    symmetry: 'Raise both arms together, to the same height.',
  });
  return {
    get count() { return count; },
    get formLast() { return form.last; },
    get form() { return form.summary; },
    update(P) {
      const nose = P(L.nose), ls = P(L.ls), rs = P(L.rs), lw = P(L.lw), rw = P(L.rw);
      if (!visible(ls, rs, lw, rw)) return { tracking: false, msg: 'Face the camera with your arms and shoulders in frame' };
      const shoulderY = (ls.y + rs.y) / 2;
      const shoulderW = Math.abs(ls.x - rs.x) || 1;
      const headH = Math.max(1, shoulderY - nose.y);
      if (state === 'up') {
        rep.height = Math.max(rep.height, (shoulderY - Math.max(lw.y, rw.y)) / headH);
        rep.diff = Math.max(rep.diff, Math.abs(lw.y - rw.y) / shoulderW);
      }
      if (state === 'down' && lw.y < nose.y && rw.y < nose.y) { state = 'up'; rep = { height: 0, diff: 0 }; }
      else if (state === 'up' && lw.y > shoulderY && rw.y > shoulderY) {
        state = 'down';
        count++;
        form.add({ height: grade(rep.height, 1, 2), symmetry: grade(rep.diff, 0.6, 0.15) });
        return { tracking: true, rep: true, msg: 'Nice!' };
      }
      return { tracking: true, msg: state === 'up' ? 'Lower to shoulder height' : 'Raise both arms overhead' };
    },
  };
}

// Flexibility test: side-on forward fold with straight knees; count = best reach score (0-100)
function foldCounter() {
  let best = 0;
  return {
    get count() { return best; },
    get form() { return null; },
    update(P) {
      const s = bestSide(P, ['sh', 'hip', 'knee', 'ankle']);
      const sh = P(s.sh), hip = P(s.hip), knee = P(s.knee), ankle = P(s.ankle);
      if (!visible(sh, hip, knee, ankle)) return { tracking: false, msg: 'Stand side-on with your whole body in frame' };
      if (angle(hip, knee, ankle) < 150) return { tracking: true, msg: 'Keep your knees straight' };
      const hipAngle = angle(sh, hip, knee); // 180 standing tall, smaller = deeper fold
      const score = Math.max(0, Math.min(100, Math.round(((170 - hipAngle) / 125) * 100)));
      best = Math.max(best, score);
      return { tracking: true, msg: score > 5 ? 'Reach further — slowly, no bouncing' : 'Fold forward from the hips' };
    },
  };
}

// Balance test: stand on one leg; counts seconds with one foot clearly lifted
function balanceCounter() {
  let held = 0, lastGood = 0;
  const sway = [];
  return {
    get count() { return Math.floor(held); },
    get held() { return held; },
    get lastGood() { return lastGood; },
    get form() {
      if (sway.length < 20) return null;
      const m = avg(sway);
      const sd = Math.sqrt(avg(sway.map((x) => (x - m) ** 2)));
      const score = grade(sd, 0.25, 0.04);
      return { score, tip: score >= 85 ? 'Rock solid — great balance!' : 'Fix your eyes on one point to reduce sway.', reps: 1 };
    },
    update(P, dt, now) {
      const ls = P(L.ls), rs = P(L.rs), lh = P(L.lh), rh = P(L.rh), la = P(L.la), ra = P(L.ra);
      if (!visible(ls, rs, lh, rh, la, ra)) return { tracking: false, msg: 'Face the camera with your whole body in frame' };
      const legLen = ((la.y - lh.y) + (ra.y - rh.y)) / 2 || 1;
      const lifted = Math.abs(la.y - ra.y) > legLen * 0.12;
      if (lifted) {
        held += dt;
        lastGood = now;
        sway.push(((lh.x + rh.x) / 2) / (Math.abs(ls.x - rs.x) || 1));
        return { tracking: true, msg: 'Balancing — stay steady' };
      }
      return { tracking: true, msg: 'Lift one foot off the floor' };
    },
  };
}

const COUNTERS = {
  squat: squatCounter, pushup: pushupCounter, jj: jackCounter, knees: kneesCounter, plank: plankCounter,
  arms: armsCounter, fold: foldCounter, balance: balanceCounter,
};
export const _counters = COUNTERS; // exposed for automated tests with synthetic poses

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

/**
 * Opens a full-screen camera overlay and counts reps / hold seconds.
 * @param {object} o
 *   type: 'squat'|'pushup'|'jj'|'knees'|'plank'|'arms'|'fold'|'balance'
 *   title: string
 *   target?: number          - mission target; auto-finishes when reached
 *   window?: number          - test mode: counting window in seconds (e.g. 30)
 * @returns {Promise<{achieved:number, verified:boolean, minAngle?:number, form:{score,tip,reps}|null} | null>}
 *          null if cancelled
 */
export function openTracker(o) {
  return new Promise((resolve) => {
    const isHold = o.type === 'plank' || o.type === 'balance';
    const unit = isHold ? 'sec' : o.type === 'fold' ? 'reach' : 'reps';
    const overlay = document.createElement('div');
    overlay.className = 'tracker mirror';
    overlay.innerHTML = `
      <div class="stage">
        <video playsinline muted autoplay></video>
        <canvas></canvas>
        <div class="hud">
          <div>
            <div class="upper" style="color:#fff">${o.title}</div>
            <div class="count"><span id="tc">0</span><small>${o.target ? ` / ${o.target}` : ''} ${unit}</small></div>
          </div>
          <div style="text-align:right">
            <div class="timer" id="tt"></div>
            <div class="form-chip" id="tform" hidden></div>
          </div>
        </div>
        <div class="big-center" id="tbig"></div>
        <div class="status" id="ts">Starting camera…</div>
      </div>
      <div class="controls">
        <button class="btn ghost" id="tcancel">Cancel</button>
        <button class="btn primary" id="tdone" disabled>Done</button>
        <button class="btn ghost" id="tflip" aria-label="Switch camera">⇄</button>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const video = overlay.querySelector('video');
    const canvas = overlay.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const $c = overlay.querySelector('#tc');
    const $t = overlay.querySelector('#tt');
    const $s = overlay.querySelector('#ts');
    const $big = overlay.querySelector('#tbig');
    const $done = overlay.querySelector('#tdone');
    const $form = overlay.querySelector('#tform');

    const counter = COUNTERS[o.type]();
    let stream = null, facing = 'user', raf = 0, closed = false;
    let phase = 'loading'; // loading -> countdown -> active -> ended
    let activeStart = 0, lastFrame = 0, lastVideoTime = -1, trackedFrames = 0;

    async function startCamera() {
      stream?.getTracks().forEach((t) => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream;
      overlay.classList.toggle('mirror', facing === 'user');
      await video.play();
    }

    function finish(cancelled) {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      overlay.remove();
      document.body.style.overflow = '';
      if (cancelled) return resolve(null);
      resolve({
        achieved: counter.count,
        verified: counter.count > 0 && trackedFrames > 15,
        minAngle: counter.minAngle,
        form: counter.form,
      });
    }

    overlay.querySelector('#tcancel').onclick = () => finish(true);
    $done.onclick = () => finish(false);
    overlay.querySelector('#tflip').onclick = async () => {
      facing = facing === 'user' ? 'environment' : 'user';
      try { await startCamera(); } catch { $s.textContent = 'Could not switch camera'; }
    };

    function draw(lm) {
      if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!lm) return;
      const W = canvas.width, H = canvas.height;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(63,180,255,0.9)';
      for (const [a, b] of BONES) {
        if ((lm[a].visibility ?? 1) < 0.5 || (lm[b].visibility ?? 1) < 0.5) continue;
        ctx.beginPath();
        ctx.moveTo(lm[a].x * W, lm[a].y * H);
        ctx.lineTo(lm[b].x * W, lm[b].y * H);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        if ((lm[i].visibility ?? 1) < 0.5) continue;
        ctx.beginPath();
        ctx.arc(lm[i].x * W, lm[i].y * H, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function countdown() {
      phase = 'countdown';
      let n = 3;
      $big.textContent = n;
      $s.textContent = o.window ? `Get ready — you'll have ${o.window} seconds` : 'Get into position';
      const iv = setInterval(() => {
        if (closed) return clearInterval(iv);
        n--;
        if (n > 0) $big.textContent = n;
        else {
          clearInterval(iv);
          $big.textContent = 'GO';
          setTimeout(() => { if (!closed) $big.textContent = ''; }, 600);
          phase = 'active';
          activeStart = performance.now();
          $done.disabled = false;
        }
      }, 1000);
    }

    function loop(landmarker) {
      raf = requestAnimationFrame(() => loop(landmarker));
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const dt = lastFrame ? Math.min(0.2, (now - lastFrame) / 1000) : 0;
      lastFrame = now;

      let lm = null;
      try { lm = landmarker.detectForVideo(video, now).landmarks?.[0] || null; } catch { return; }
      draw(lm);

      if (phase !== 'active') return;
      const elapsed = (now - activeStart) / 1000;

      if (o.window) {
        const left = Math.max(0, o.window - elapsed);
        $t.textContent = `${Math.ceil(left)}s`;
        if (left <= 0) { phase = 'ended'; $s.textContent = 'Time!'; setTimeout(() => finish(false), 500); return; }
      } else {
        $t.textContent = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
      }

      if (!lm) { $s.textContent = 'No body detected — step back into view'; return; }
      const W = video.videoWidth, H = video.videoHeight;
      const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility ?? 1 });
      const r = counter.update(P, dt, now);
      if (r.tracking) trackedFrames++;
      if (r.rep) navigator.vibrate?.(25);
      $s.textContent = r.msg;
      $c.textContent = counter.count;
      const live = counter.formLast ?? counter.form?.score;
      if (typeof live === 'number') {
        $form.hidden = false;
        $form.textContent = `Form ${live}`;
        $form.className = 'form-chip ' + (live >= 80 ? 'good' : live >= 60 ? 'ok' : 'low');
      }

      if (o.target && counter.count >= o.target) {
        phase = 'ended';
        $s.textContent = 'Target reached! Verified ✓';
        setTimeout(() => finish(false), 900);
      }
      // Hold test with no target: end after position has been lost for 3s (plank) / 2s (balance)
      const grace = o.type === 'balance' ? 2000 : 3000;
      if (isHold && !o.target && phase === 'active' && counter.held >= 3 && now - counter.lastGood > grace) {
        phase = 'ended';
        $s.textContent = `Held for ${counter.count}s`;
        setTimeout(() => finish(false), 700);
      }
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        $s.textContent = 'Camera not available. Open ATHLORA over https (or localhost) in Chrome/Safari.';
        return;
      }
      try {
        await startCamera();
      } catch (err) {
        $s.textContent = err.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access and try again.' : 'Could not start the camera.';
        return;
      }
      $s.textContent = 'Loading AI model…';
      try {
        const landmarker = await getLandmarker();
        if (closed) return;
        loop(landmarker);
        countdown();
      } catch {
        $s.textContent = 'Could not load the AI model. Check your internet connection.';
      }
    })();
  });
}
