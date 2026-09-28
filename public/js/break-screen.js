// Projector screen for a teacher-led class movement break: /break.html#CODE.hostKey
import { api } from './api.js';
import { esc, toast } from './ui.js';
import { breakPhase, clockOffset, joinUrl } from './breakclock.js';

const root = document.getElementById('root');
const [code = '', hostKey = ''] = location.hash.replace(/^#/, '').split('.');
const isHost = Boolean(hostKey);
let view = null, offset = 0, lastIndex = -1;

function beep(freq = 880, ms = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + ms / 1000);
  } catch {}
}

async function refresh() {
  const t0 = Date.now();
  const v = await api(`/breaks/${code}`);
  offset = clockOffset(v, t0);
  view = v;
}

async function hostAction(action) {
  try {
    const t0 = Date.now();
    const v = await api(`/breaks/${code}/${action}`, { method: 'POST', body: { hostKey } });
    offset = clockOffset(v, t0);
    view = v;
    paint();
  } catch (err) { toast(err.message, true); }
}

let lastSig = '';
function paint() {
  if (!view) return;
  const p = breakPhase(view, offset);
  // Only redraw when something visible changed (keeps buttons stable under the teacher's finger)
  const sig = JSON.stringify([p.phase, p.index, p.secLeft, view.participants, view.completed, Math.round((p.progress || 0) * 100)]);
  if (sig === lastSig) return;
  lastSig = sig;
  const foot = `
    <div class="p-foot">
      <div class="brand"><img src="/icons/icon.svg" alt="" />ATHLORA</div>
      <div class="row" style="gap:10px">
        <span class="tag lime">${view.participants} joined</span>
        ${view.completed ? `<span class="tag">${view.completed} completed</span>` : ''}
        ${isHost && (p.phase === 'move' || p.phase === 'countdown') ? '<button class="btn sm ghost" id="end">End early</button>' : ''}
      </div>
    </div>`;
  let main;
  if (p.phase === 'lobby') {
    main = `
      <div class="lobby">
        <img src="/api/qr?data=${encodeURIComponent(joinUrl(code))}" alt="QR code to join" />
        <div>
          <div class="upper">${esc(view.title)} · ${view.minutes} min${view.seated ? ' · seated' : ''}</div>
          <h1 style="font-size:clamp(28px,4vw,52px);font-weight:800;margin:10px 0">Scan to join, or enter the code in ATHLORA</h1>
          <div class="big-code">${esc(view.code)}</div>
          <p class="muted mt-16">ATHLORA app → Class tab → Join</p>
          ${isHost ? `<button class="btn primary mt-16" id="start" style="font-size:20px;padding:16px 28px">▶ Start break for everyone</button>` : '<p class="small muted mt-16">Waiting for the teacher to start…</p>'}
        </div>
      </div>`;
  } else if (p.phase === 'countdown') {
    main = `<div><div class="upper" style="font-size:20px">Stand up! Starting in</div><div class="p-count">${p.secLeft}</div></div>`;
  } else if (p.phase === 'move') {
    if (p.index !== lastIndex) { lastIndex = p.index; beep(); }
    main = `
      <div style="width:100%">
        <div class="upper" style="font-size:18px">Move ${p.index + 1} of ${view.moves.length}</div>
        <div class="p-move mt-8">${esc(p.move.name)}</div>
        <div class="p-count mt-16">${p.secLeft}</div>
        <div class="p-cue">${esc(p.move.cue)}</div>
        ${p.next ? `<p class="muted mt-16" style="font-size:20px">Next: ${esc(p.next.name)}</p>` : ''}
        <div class="bar mt-16" style="height:10px;max-width:900px;margin-left:auto;margin-right:auto"><div style="width:${Math.round(p.progress * 100)}%"></div></div>
      </div>`;
  } else if (p.phase === 'done') {
    if (lastIndex !== -2) { lastIndex = -2; beep(660, 400); }
    main = `
      <div>
        <div class="p-move">Great job, class! 🎉</div>
        <p class="p-cue">${view.completed} student${view.completed === 1 ? '' : 's'} completed the break in ATHLORA and earned XP.</p>
        ${isHost ? '<a class="btn primary mt-16" href="/#/class" style="display:inline-flex">Back to ATHLORA</a>' : ''}
      </div>`;
  } else {
    main = '<div><div class="p-move">This break has expired</div><p class="p-cue">Create a new one from the Class tab.</p></div>';
  }
  root.innerHTML = `<div class="proj-main">${main}</div>${foot}`;
  root.querySelector('#start')?.addEventListener('click', () => { beep(520); hostAction('start'); });
  root.querySelector('#end')?.addEventListener('click', () => hostAction('end'));
}

(async () => {
  if (!code) {
    root.innerHTML = '<div class="proj-main"><div><div class="p-move">No break code</div><p class="p-cue">Create a class break from ATHLORA → Class tab.</p></div></div>';
    return;
  }
  try { await refresh(); } catch (err) {
    root.innerHTML = `<div class="proj-main"><div><div class="p-move">${esc(err.message)}</div></div></div>`;
    return;
  }
  paint();
  setInterval(paint, 250);
  setInterval(() => refresh().catch(() => {}), 2000);
})();
