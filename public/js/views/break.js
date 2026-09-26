// Student side of a teacher-led class movement break (#/break/CODE).
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { breakPhase, clockOffset } from '../breakclock.js';

export async function render(el, app) {
  const code = (app.store.routeParam || '').toUpperCase();
  let view = null, offset = 0, poll = 0, tick = 0, finished = false, lastIndex = -1;

  const stop = () => { clearInterval(poll); clearInterval(tick); };

  if (!code) {
    el.innerHTML = `<div class="empty">No class break code. Ask your teacher for the code on the projector screen.</div>`;
    return;
  }

  async function refresh(join = false) {
    const t0 = Date.now();
    const v = join
      ? await api(`/breaks/${code}/join`, { method: 'POST' })
      : await api(`/breaks/${code}`);
    offset = clockOffset(v, t0);
    view = v;
  }

  try {
    await refresh(true);
  } catch (err) {
    el.innerHTML = `
      <div class="stack center">
        <div class="upper mt-16">Class movement break</div>
        <div class="empty">${esc(err.message)}</div>
        <button class="btn ghost block" id="home">Back to dashboard</button>
      </div>`;
    el.querySelector('#home').onclick = () => app.navigate('dashboard');
    return;
  }

  el.innerHTML = `
    <div class="stack center">
      <div class="row between"><span class="upper">${esc(view.title)}</span><span class="tag lime">${esc(code)}</span></div>
      <section class="card" style="padding:28px 18px" id="stage"></section>
      <div class="progress-dots" id="dots"></div>
      <p class="tiny muted" id="people"></p>
    </div>`;
  const stage = el.querySelector('#stage');

  let lastSig = '';
  function paint() {
    const p = breakPhase(view, offset);
    const sig = JSON.stringify([p.phase, p.index, p.secLeft, view.participants]);
    if (sig === lastSig) return;
    lastSig = sig;
    el.querySelector('#people').textContent = `${view.participants} joined · led by ${view.hostName}`;
    el.querySelector('#dots').innerHTML = view.moves.map((_, i) =>
      `<span class="${p.phase === 'done' || (p.phase === 'move' && i < p.index) ? 'on' : p.phase === 'move' && i === p.index ? 'cur' : ''}"></span>`).join('');
    if (p.phase === 'lobby') {
      stage.innerHTML = `<div class="posture-icon accent">✓</div><h2>You're in!</h2><p class="muted mt-8">Waiting for ${esc(view.hostName)} to start. Stand up and make a little space around your desk.</p>`;
    } else if (p.phase === 'countdown') {
      stage.innerHTML = `<div class="upper">Get ready</div><div class="break-count mt-8">${p.secLeft}</div>`;
    } else if (p.phase === 'move') {
      if (p.index !== lastIndex) { lastIndex = p.index; navigator.vibrate?.(60); }
      stage.innerHTML = `
        <div class="upper">Move ${p.index + 1} of ${view.moves.length}</div>
        <div class="break-move mt-8">${esc(p.move.name)}</div>
        <div class="break-count mt-16">${p.secLeft}</div>
        <p class="muted mt-8">${esc(p.move.cue)}</p>
        ${p.next ? `<p class="tiny muted mt-16">Next: ${esc(p.next.name)}</p>` : ''}`;
    } else if (p.phase === 'done' && !finished) {
      finished = true;
      complete();
    } else if (p.phase === 'expired') {
      stage.innerHTML = '<h2>This break has expired</h2>';
      stop();
    }
  }

  async function complete() {
    stop();
    stage.innerHTML = '<div class="spinner"></div>';
    try {
      const r = await api(`/breaks/${code}/complete`, { method: 'POST' });
      app.store.stats = r.stats;
      app.updateLevelTag();
      stage.innerHTML = `
        <div class="upper">Class break complete</div>
        <div class="big-xp mt-8">+${r.reward.xp}</div>
        <div class="muted">Fitness XP</div>
        <div class="mt-16" style="text-align:left">${r.reward.breakdown.map((b) => `<div class="reward-line"><span>${esc(b.label)}</span><b class="accent">+${b.xp}</b></div>`).join('')}</div>
        <p class="small mt-16">🔥 ${r.stats.streak}-day streak. Let's go!</p>`;
    } catch (err) {
      stage.innerHTML = `<h2>Break finished</h2><p class="muted mt-8">${esc(err.message)}</p>`;
    }
    stage.insertAdjacentHTML('beforeend', '<button class="btn primary block mt-16" id="home">Back to dashboard</button>');
    stage.querySelector('#home').onclick = () => app.navigate('dashboard');
  }

  paint();
  tick = setInterval(paint, 250);
  // Poll for the teacher pressing Start (and for the join count); slower once running
  poll = setInterval(async () => {
    const p = breakPhase(view, offset);
    if (p.phase === 'move' && Math.random() < 0.7) return;
    try { await refresh(false); } catch {}
  }, 2000);

  return stop;
}
