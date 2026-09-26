// Phone-sensor verification for walks and stairs (no wearable needed).
// Counts steps from the accelerometer: a smoothed acceleration peak above a moving baseline = one step.

export const STEPS_PER_FLOOR = 18;

export function motionSupported() {
  return typeof window.DeviceMotionEvent !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

// Pure step detector, fed with acceleration magnitudes (m/s²) and timestamps (ms). Exported for tests.
export function createStepDetector() {
  let smooth = null, baseline = null, armed = true, lastStep = -Infinity, steps = 0;
  const times = [];
  return {
    get steps() { return steps; },
    // steps per minute over the last 10 seconds
    cadence(now) {
      const recent = times.filter((t) => now - t <= 10000);
      return recent.length < 2 ? 0 : Math.round((recent.length / 10) * 60);
    },
    lastStepAt: () => lastStep,
    push(mag, t) {
      smooth = smooth === null ? mag : smooth * 0.75 + mag * 0.25;
      baseline = baseline === null ? mag : baseline * 0.97 + smooth * 0.03;
      const d = smooth - baseline;
      if (armed && d > 1.1 && t - lastStep > 280) {
        steps++;
        lastStep = t;
        times.push(t);
        if (times.length > 60) times.shift();
        armed = false;
        return true;
      }
      if (d < 0.2) armed = true; // must drop back before the next step counts
      return false;
    },
  };
}

/**
 * Full-screen step tracker.
 * @param o { title, unit: 'sec'|'floors', target }
 * @returns Promise<{ achieved, verified, steps, cadence } | null>  (null = cancelled)
 */
export function openStepTracker(o) {
  // iOS needs permission requested directly inside the tap handler, before any await
  const permission = typeof DeviceMotionEvent?.requestPermission === 'function'
    ? DeviceMotionEvent.requestPermission().catch(() => 'denied')
    : Promise.resolve('granted');

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'tracker steps-tracker';
    const goal = o.unit === 'floors' ? `${o.target} floors (~${o.target * STEPS_PER_FLOOR} steps)` : `${Math.round(o.target / 60 * 10) / 10} min of walking`;
    overlay.innerHTML = `
      <div class="steps-body">
        <div class="upper" style="color:#fff">${o.title} · sensor check</div>
        <div class="steps-count"><span id="sc">0</span><small>steps</small></div>
        <div class="row" style="gap:10px;justify-content:center">
          <span class="tag" id="cad">— steps/min</span><span class="tag" id="tim">0:00</span>
        </div>
        <div class="bar mt-16" style="height:12px;width:100%"><div id="prog" style="width:0%"></div></div>
        <p class="small muted mt-8">Goal: ${goal}</p>
        <p class="status-line mt-16" id="st">Starting motion sensor…</p>
        <p class="tiny muted mt-16">Keep the screen on. Hold the phone or put it in your pocket and start moving. ATHLORA keeps the screen awake.</p>
      </div>
      <div class="controls" style="grid-template-columns:1fr 1fr">
        <button class="btn ghost" id="scancel">Cancel</button>
        <button class="btn primary hold-btn" id="sstop"><span class="hold-fill"></span><span class="hold-label">Hold to finish</span></button>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const $ = (s) => overlay.querySelector(s);
    const det = createStepDetector();
    let started = 0, activeMs = 0, lastTick = 0, events = 0, closed = false, wake = null, timer = 0;

    const achieved = () => o.unit === 'floors'
      ? Math.min(o.target, Math.floor(det.steps / STEPS_PER_FLOOR))
      : Math.min(o.target, Math.floor(activeMs / 1000));
    const progress = () => o.unit === 'floors'
      ? det.steps / (o.target * STEPS_PER_FLOOR)
      : activeMs / 1000 / o.target;

    function onMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null) return;
      events++;
      const now = performance.now();
      if (!started) started = now;
      det.push(Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z), now);
      // Count time as "active walking" while steps keep coming
      if (lastTick && now - det.lastStepAt() < 1500) activeMs += now - lastTick;
      lastTick = now;
    }

    function render() {
      if (closed) return;
      const now = performance.now();
      const cad = det.cadence(now);
      $('#sc').textContent = det.steps;
      $('#cad').textContent = `${cad || '—'} steps/min${cad >= 100 ? ' · brisk ✓' : ''}`;
      const t = started ? Math.floor((now - started) / 1000) : 0;
      $('#tim').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      $('#prog').style.width = `${Math.min(100, progress() * 100)}%`;
      if (events === 0 && t === 0 && now - opened > 2500) $('#st').textContent = "No motion sensor detected. Open ATHLORA on your phone to verify walks.";
      else if (det.steps === 0) $('#st').textContent = 'Start walking…';
      else if (cad && cad < 70) $('#st').textContent = 'Pick up the pace a little!';
      else $('#st').textContent = 'Tracking your steps ✓';
      if (progress() >= 1) { $('#st').textContent = 'Goal reached! Verified ✓'; finish(false); }
    }

    async function finish(cancelled) {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      window.removeEventListener('devicemotion', onMotion);
      try { await wake?.release(); } catch {}
      setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; }, cancelled ? 0 : 700);
      if (cancelled) return resolve(null);
      const cadence = activeMs > 0 ? Math.round(det.steps / (activeMs / 60000)) : 0;
      resolve({
        achieved: achieved(),
        steps: det.steps,
        cadence,
        // Verified = real steps at a walking pace were detected
        verified: det.steps >= 20 && (o.unit === 'floors' || cadence >= 60),
      });
    }

    $('#scancel').onclick = () => finish(true);

    // Press-and-hold to finish, so a pocket or a stray tap can't end the session
    const hold = $('#sstop');
    let holdTimer = null;
    const startHold = (e) => { e.preventDefault(); hold.classList.add('holding'); holdTimer = setTimeout(() => finish(false), 1000); };
    const endHold = () => { hold.classList.remove('holding'); clearTimeout(holdTimer); };
    hold.addEventListener('pointerdown', startHold);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => hold.addEventListener(ev, endHold));

    const opened = performance.now();
    permission.then(async (p) => {
      if (closed) return;
      if (p !== 'granted') { $('#st').textContent = 'Motion access was denied. Allow "Motion & Orientation" for this site and try again.'; return; }
      window.addEventListener('devicemotion', onMotion);
      try { wake = await navigator.wakeLock?.request('screen'); } catch {}
      timer = setInterval(render, 250);
    });
  });
}
