// Posture Guardian: while a student studies, the camera (on-device) watches sitting posture and
// sitting time, nudges them to sit tall, and turns long sitting stretches into a 2-minute Move Mission.
import { api } from '../api.js';
import { esc, toast, chips, bindChips, chipValue } from '../ui.js';
import { getLandmarker } from '../tracker.js';
import { measure, calibrate, classify, STATUS } from '../posture.js';

const BREAK_OPTIONS = [['1', 'Demo: 1 min'], ['20', '20 min'], ['30', '30 min'], ['45', '45 min']];
const SLOUCH_ALERT_SEC = 45;      // sustained bad posture before a nudge
const ALERT_COOLDOWN_MS = 120000; // at most one nudge every 2 minutes

// Survives leaving the page for a movement break
let session = null;

function notify(title, body) {
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.showNotification(title, { body, icon: '/icons/icon-192.png', tag: 'posture', data: { url: '/#/study' } }));
    }
  } catch {}
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 660; g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.18);
  } catch {}
}

const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export async function render(el, app) {
  const { store } = app;
  let stream = null, loop = 0;

  function stopCamera() {
    clearInterval(loop);
    loop = 0;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function startCamera(video) {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = stream;
    await video.play();
  }

  // ---------- setup ----------
  function drawSetup() {
    el.innerHTML = `
      <div class="stack">
        <div>
          <div class="upper">Study mode</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:4px">Posture Guardian</h1>
          <p class="muted small mt-8">Study as usual. ATHLORA watches your sitting posture and how long you've been sitting, nudges you to sit tall, and suggests a 2-minute movement break before sitting turns into a problem.</p>
        </div>
        <section class="card">
          <p class="upper">Movement break every</p>
          <div class="mt-8">${chips('every', BREAK_OPTIONS, '30')}</div>
          <p class="upper mt-16">Camera preview</p>
          <div class="mt-8">${chips('preview', [['show', 'Show'], ['hide', 'Hide']], 'show')}</div>
          <button class="btn primary block mt-16" id="begin">Start study session</button>
        </section>
        <section class="card">
          <p class="small"><b>How to set up</b></p>
          <p class="small muted mt-8">Put your laptop or phone in front of you so your head and shoulders are visible. Keep this window open beside your notes. Browsers pause the camera in hidden tabs, but break reminders still arrive.</p>
          <p class="tiny muted mt-8">🔒 Everything runs on your device. Nothing is recorded or uploaded.</p>
        </section>
      </div>`;
    bindChips(el);
    el.querySelector('#begin').onclick = async () => {
      try { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); } catch {}
      session = {
        breakEveryMs: Number(chipValue(el, 'every')) * 60000,
        preview: chipValue(el, 'preview') === 'show',
        startedAt: Date.now(), sittingSince: Date.now(),
        goodMs: 0, badMs: 0, awayMs: 0, alerts: 0, breaksTaken: 0,
        badSince: null, lastAlert: 0, snoozeUntil: 0, base: null, status: 'away',
      };
      drawLive();
    };
  }

  // ---------- live session ----------
  async function drawLive() {
    el.innerHTML = `
      <div class="stack">
        <div class="row between"><span class="upper">Posture Guardian</span><span class="tag" id="clock">0:00</span></div>
        <section class="card center posture-card" id="statusCard">
          <div class="posture-icon" id="sIcon">…</div>
          <h2 id="sLabel">Starting camera…</h2>
          <p class="small muted mt-8" id="sTip">Allow camera access when asked.</p>
        </section>
        <div class="study-preview" ${session.preview ? '' : 'hidden'}>
          <video playsinline muted autoplay></video>
          <canvas></canvas>
        </div>
        <video playsinline muted autoplay id="hiddenVideo" ${session.preview ? 'hidden' : ''} style="width:1px;height:1px;opacity:0;position:absolute"></video>
        <div class="grid-3">
          <div class="stat"><div class="v" id="goodPct">—</div><div class="l">good posture</div></div>
          <div class="stat"><div class="v" id="sitting">0:00</div><div class="l">sitting</div></div>
          <div class="stat"><div class="v" id="nextBreak">—</div><div class="l">next break</div></div>
        </div>
        <section class="card warm" id="breakCard" hidden>
          <h2>Time to move 🧍</h2>
          <p class="muted small mt-8" id="breakText"></p>
          <div class="grid-2 mt-16">
            <button class="btn primary" id="takeBreak">2-min break</button>
            <button class="btn ghost" id="snooze">Snooze 5 min</button>
          </div>
        </section>
        <button class="btn ghost block" id="endSession">End session</button>
      </div>`;

    const video = session.preview ? el.querySelector('.study-preview video') : el.querySelector('#hiddenVideo');
    const canvas = el.querySelector('.study-preview canvas');
    const $ = (s) => el.querySelector(s);

    $('#endSession').onclick = finishSession;
    $('#snooze').onclick = () => { session.snoozeUntil = Date.now() + 5 * 60000; $('#breakCard').hidden = true; };
    $('#takeBreak').onclick = () => {
      session.breaksTaken++;
      session.sittingSince = Date.now();
      session.paused = true;
      stopCamera();
      store.returnTo = 'study';
      store.missionRequest = { minutes: 2, environment: store.user.profile.environment === 'classroom' ? 'classroom' : 'room' };
      app.navigate('move');
    };

    try {
      await startCamera(video);
    } catch (err) {
      $('#sLabel').textContent = 'Camera not available';
      $('#sTip').textContent = err.name === 'NotAllowedError' ? 'Allow camera access for this site and try again.' : 'Could not start the camera.';
      return;
    }
    let landmarker;
    try {
      $('#sTip').textContent = 'Loading AI model…';
      landmarker = await getLandmarker();
    } catch {
      $('#sTip').textContent = 'Could not load the AI model. Check your internet connection.';
      return;
    }
    session.paused = false;

    const detect = () => {
      if (video.readyState < 2) return null;
      try {
        const lm = landmarker.detectForVideo(video, performance.now()).landmarks?.[0] || null;
        if (session.preview && canvas) drawSkeleton(canvas, video, lm);
        return measure(lm, video.videoWidth, video.videoHeight);
      } catch { return null; }
    };

    // Calibrate on the student's own "sitting tall" posture
    if (!session.base) {
      $('#sIcon').textContent = '3';
      $('#sLabel').textContent = 'Sit up straight';
      $('#sTip').textContent = 'Look at your screen with your shoulders relaxed. Calibrating…';
      const samples = [];
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (!stream) return;
        samples.push(detect());
        $('#sIcon').textContent = String(3 - Math.floor(i / 4));
      }
      session.base = calibrate(samples);
      if (!session.base) {
        $('#sIcon').textContent = '…';
        $('#sLabel').textContent = "Can't see your shoulders";
        $('#sTip').textContent = 'Move back a little so your head and both shoulders are in view, then tap Retry.';
        $('#statusCard').insertAdjacentHTML('beforeend', '<button class="btn sm mt-16" id="retry">Retry</button>');
        $('#retry').onclick = () => { stopCamera(); drawLive(); };
        return;
      }
      toast('Calibrated to your posture ✓');
    }

    let last = performance.now();
    loop = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(5000, now - last);
      last = now;
      const status = classify(detect(), session.base);
      session.status = status;
      if (status === 'good') { session.goodMs += dt; session.badSince = null; }
      else if (status === 'away') { session.awayMs += dt; session.badSince = null; }
      else {
        session.badMs += dt;
        session.badSince ??= Date.now();
        if (Date.now() - session.badSince > SLOUCH_ALERT_SEC * 1000 && Date.now() - session.lastAlert > ALERT_COOLDOWN_MS) {
          session.alerts++;
          session.lastAlert = Date.now();
          chime();
          toast(`${STATUS[status].label}: ${STATUS[status].tip}`);
          notify('ATHLORA · posture check', STATUS[status].tip);
        }
      }
      paint();
    }, 500);

    function paint() {
      const s = STATUS[session.status];
      $('#sIcon').textContent = s.icon;
      $('#sIcon').style.color = s.color;
      $('#sLabel').textContent = s.label;
      $('#sTip').textContent = s.tip;
      $('#statusCard').style.borderColor = session.status === 'good' ? 'rgba(63,180,255,.4)' : session.status === 'away' ? 'var(--line)' : 'rgba(255,181,71,.5)';
      const seen = session.goodMs + session.badMs;
      $('#goodPct').textContent = seen > 5000 ? `${Math.round((session.goodMs / seen) * 100)}%` : '—';
      $('#clock').textContent = fmt(Date.now() - session.startedAt);
      const sat = Date.now() - session.sittingSince;
      $('#sitting').textContent = fmt(sat);
      const due = session.breakEveryMs - sat;
      $('#nextBreak').textContent = due > 0 ? fmt(due) : 'now';
      if (due <= 0 && Date.now() > session.snoozeUntil && $('#breakCard').hidden) {
        $('#breakCard').hidden = false;
        $('#breakText').textContent = `You've been sitting for ${Math.round(sat / 60000)} min. A 2-minute movement break resets your body and your focus.`;
        chime();
        notify('ATHLORA · time to move', `You've been sitting for ${Math.round(sat / 60000)} minutes. Take a 2-minute break.`);
      }
    }
  }

  async function finishSession() {
    stopCamera();
    const s = session;
    const minutes = (Date.now() - s.startedAt) / 60000;
    const seen = s.goodMs + s.badMs;
    const goodPct = seen ? Math.round((s.goodMs / seen) * 100) : 0;
    session = null;
    store.returnTo = null;
    if (minutes < 1) { toast('Session too short to save (under a minute)'); drawSetup(); return; }
    el.innerHTML = '<div class="spinner"></div>';
    try {
      const r = await api('/study-sessions', { method: 'POST', body: { minutes, goodPct, alerts: s.alerts, breaksTaken: s.breaksTaken } });
      store.stats = r.stats;
      app.updateLevelTag();
      el.innerHTML = `
        <div class="stack center">
          <div class="upper mt-16">Study session saved</div>
          <div class="big-xp">${goodPct}%</div>
          <div class="muted">of your study time in good posture</div>
          <div class="grid-3">
            <div class="stat"><div class="v">${Math.round(minutes)}</div><div class="l">minutes</div></div>
            <div class="stat"><div class="v">${s.alerts}</div><div class="l">posture nudges</div></div>
            <div class="stat"><div class="v">${s.breaksTaken}</div><div class="l">move breaks</div></div>
          </div>
          ${r.reward.xp ? `<section class="card" style="text-align:left">${r.reward.breakdown.map((b) => `<div class="reward-line"><span>${esc(b.label)}</span><b class="accent">+${b.xp}</b></div>`).join('')}</section>`
            : '<p class="small muted">Study for 10+ minutes to earn XP.</p>'}
          <button class="btn primary block" id="again">New session</button>
          <button class="btn ghost block" id="home">Back to dashboard</button>
        </div>`;
      el.querySelector('#again').onclick = drawSetup;
      el.querySelector('#home').onclick = () => app.navigate('dashboard');
    } catch (err) {
      toast(err.message, true);
      drawSetup();
    }
  }

  if (session) {
    // Coming back from a movement break: resume the same session
    if (session.paused) toast('Welcome back! Posture Guardian resumed.');
    store.returnTo = null;
    drawLive();
  } else {
    drawSetup();
  }

  return () => stopCamera();
}

function drawSkeleton(canvas, video, lm) {
  if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!lm) return;
  const W = canvas.width, H = canvas.height;
  const pt = (i) => [lm[i].x * W, lm[i].y * H];
  ctx.strokeStyle = 'rgba(63,180,255,.9)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(...pt(11)); ctx.lineTo(...pt(12)); ctx.stroke();
  const mid = [(pt(11)[0] + pt(12)[0]) / 2, (pt(11)[1] + pt(12)[1]) / 2];
  ctx.beginPath(); ctx.moveTo(...mid); ctx.lineTo(...pt(0)); ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const i of [0, 11, 12]) { ctx.beginPath(); ctx.arc(...pt(i), 6, 0, Math.PI * 2); ctx.fill(); }
}
