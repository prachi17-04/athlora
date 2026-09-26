// Real-time computer-vision exercise verification (runs fully in the browser).
// MediaPipe Pose Landmarker -> joint angles -> rep / hold counters.
// Video never leaves the device.

const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarkerPromise = null;
function getLandmarker() {
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

// ---------- counters ----------
function squatCounter() {
  let state = 'up', count = 0, minAngle = 180;
  return {
    get count() { return count; },
    get minAngle() { return minAngle; },
    update(P) {
      const s = bestSide(P, ['hip', 'knee', 'ankle']);
      const hip = P(s.hip), knee = P(s.knee), ankle = P(s.ankle);
      if (!visible(hip, knee, ankle)) return { tracking: false, msg: 'Step back so your hips, knees and ankles are visible' };
      const a = angle(hip, knee, ankle);
      if (a >= 40) minAngle = Math.min(minAngle, a);
      if (state === 'up' && a < 110) state = 'down';
      else if (state === 'down' && a > 155) { state = 'up'; count++; return { tracking: true, rep: true, msg: 'Nice rep!' }; }
      return { tracking: true, msg: state === 'down' ? 'Good depth — drive up' : a < 140 ? 'Lower…' : 'Squat down' };
    },
  };
}

function pushupCounter() {
  let state = 'up', count = 0;
  return {
    get count() { return count; },
    update(P) {
      const s = bestSide(P, ['sh', 'el', 'wr']);
      const sh = P(s.sh), el = P(s.el), wr = P(s.wr);
      if (!visible(sh, el, wr)) return { tracking: false, msg: 'Turn side-on so your shoulder, elbow and wrist are visible' };
      const a = angle(sh, el, wr);
      if (state === 'up' && a < 100) state = 'down';
      else if (state === 'down' && a > 150) { state = 'up'; count++; return { tracking: true, rep: true, msg: 'Nice rep!' }; }
      return { tracking: true, msg: state === 'down' ? 'Push back up' : a < 130 ? 'Lower…' : 'Bend your elbows' };
    },
  };
}

function jackCounter() {
  let state = 'closed', count = 0;
  return {
    get count() { return count; },
    update(P) {
      const ls = P(L.ls), rs = P(L.rs), lw = P(L.lw), rw = P(L.rw), la = P(L.la), ra = P(L.ra);
      if (!visible(ls, rs, lw, rw, la, ra)) return { tracking: false, msg: 'Face the camera with your whole body in frame' };
      const shoulderW = Math.abs(ls.x - rs.x) || 1;
      const feet = Math.abs(la.x - ra.x);
      const handsUp = lw.y < ls.y && rw.y < rs.y;
      const handsDown = lw.y > ls.y && rw.y > rs.y;
      if (state === 'closed' && handsUp && feet > shoulderW * 1.1) state = 'open';
      else if (state === 'open' && handsDown) { state = 'closed'; count++; return { tracking: true, rep: true, msg: 'Keep going!' }; }
      return { tracking: true, msg: state === 'open' ? 'Arms down, feet together' : 'Arms up, feet wide' };
    },
  };
}

function kneesCounter() {
  const st = { left: 'down', right: 'down' };
  let count = 0;
  return {
    get count() { return count; },
    update(P) {
      const ls = P(L.ls), rs = P(L.rs), lh = P(L.lh), rh = P(L.rh), lk = P(L.lk), rk = P(L.rk);
      if (!visible(ls, rs, lh, rh, lk, rk)) return { tracking: false, msg: 'Face the camera, hips and knees in frame' };
      const torso = Math.abs((lh.y + rh.y) / 2 - (ls.y + rs.y) / 2) || 1;
      let rep = false;
      for (const [side, hip, knee] of [['left', lh, lk], ['right', rh, rk]]) {
        const lift = knee.y - hip.y; // smaller = higher knee
        if (st[side] === 'down' && lift < torso * 0.4) { st[side] = 'up'; count++; rep = true; }
        else if (st[side] === 'up' && lift > torso * 0.6) st[side] = 'down';
      }
      return { tracking: true, rep, msg: 'Drive those knees up!' };
    },
  };
}

function plankCounter() {
  let held = 0, lastGood = 0;
  return {
    get count() { return Math.floor(held); },
    get held() { return held; },
    get lastGood() { return lastGood; },
    update(P, dt, now) {
      const s = bestSide(P, ['sh', 'hip', 'ankle']);
      const sh = P(s.sh), hip = P(s.hip), ankle = P(s.ankle);
      if (!visible(sh, hip, ankle)) return { tracking: false, msg: 'Turn side-on so your whole body is visible' };
      const straight = angle(sh, hip, ankle) > 150;
      const flat = Math.abs(sh.y - ankle.y) < Math.abs(sh.x - ankle.x) * 0.6;
      if (straight && flat) {
        held += dt;
        lastGood = now;
        return { tracking: true, msg: 'Holding — keep your body straight' };
      }
      return { tracking: true, msg: !flat ? 'Get into plank position' : 'Straighten your hips' };
    },
  };
}

const COUNTERS = { squat: squatCounter, pushup: pushupCounter, jj: jackCounter, knees: kneesCounter, plank: plankCounter };

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

/**
 * Opens a full-screen camera overlay and counts reps / hold seconds.
 * @param {object} o
 *   type: 'squat'|'pushup'|'jj'|'knees'|'plank'
 *   title: string
 *   target?: number          - mission target; auto-finishes when reached
 *   window?: number          - test mode: counting window in seconds (e.g. 30)
 * @returns {Promise<{achieved:number, verified:boolean, minAngle?:number} | null>} null if cancelled
 */
export function openTracker(o) {
  return new Promise((resolve) => {
    const isHold = o.type === 'plank';
    const unit = isHold ? 'sec' : 'reps';
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
          <div class="timer" id="tt"></div>
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
      ctx.strokeStyle = 'rgba(198,255,61,0.9)';
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

      if (o.target && counter.count >= o.target) {
        phase = 'ended';
        $s.textContent = 'Target reached! Verified ✓';
        setTimeout(() => finish(false), 900);
      }
      // Hold test with no target: end after form has been broken for 3s
      if (isHold && !o.target && counter.held >= 3 && now - counter.lastGood > 3000) {
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
