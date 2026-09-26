import { api } from '../api.js';
import { esc, toast, chips, bindChips, chipValue, fmtTarget, TIME_OPTIONS, ENV_OPTIONS, EQUIP_OPTIONS, ICONS } from '../ui.js';
import { openTracker } from '../tracker.js';

// Survives tab switches so a mission in progress isn't lost
let current = null; // { mission, params, results: [], index: -1, reward? }

const ENV_LABEL = Object.fromEntries(ENV_OPTIONS);

export async function render(el, app) {
  const { store } = app;
  let timer = null;

  async function generate(params) {
    el.innerHTML = '<div class="spinner"></div><p class="center muted small">Finding your best movement opportunity…</p>';
    try {
      const r = await api('/missions/generate', { method: 'POST', body: params });
      current = { mission: r.mission, params, results: [], index: -1 };
    } catch (err) {
      toast(err.message, true);
      current = null;
    }
    draw();
  }

  function draw() {
    clearInterval(timer);
    timer = null;
    if (!current) return drawForm();
    if (current.reward) return drawReward();
    if (current.index < 0) return drawMission();
    return drawRunner();
  }

  // ---------- 1. Context form ----------
  function drawForm() {
    const p = store.user.profile;
    el.innerHTML = `
      <div class="stack">
        <div>
          <div class="upper">Move Mission</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:4px">Find a movement opportunity</h1>
          <p class="muted small mt-8">ATHLORA's context engine looks at your time, fitness level, goal, environment, equipment and recent activity — then builds a mission that fits your actual day.</p>
        </div>
        <section class="card">
          <p class="upper">Time available</p>
          <div class="mt-8">${chips('time', TIME_OPTIONS, '5')}</div>
          <p class="upper mt-16">Where are you?</p>
          <div class="mt-8">${chips('env', ENV_OPTIONS, p.environment || 'room')}</div>
          <p class="upper mt-16">Equipment nearby <span style="text-transform:none;letter-spacing:0">(optional)</span></p>
          <div class="mt-8">${chips('equip', EQUIP_OPTIONS, p.equipment || [], { multi: true })}</div>
          <button class="btn primary block mt-16" id="gen">Generate Move Mission</button>
        </section>
        <p class="small muted center">Tip: moves with ${ICONS.camera} can be verified by your camera for 1.5× XP.</p>
      </div>`;
    bindChips(el);
    el.querySelector('#gen').onclick = () => generate({
      minutes: Number(chipValue(el, 'time')),
      environment: chipValue(el, 'env'),
      equipment: chipValue(el, 'equip'),
    });
  }

  // ---------- 2. Mission card ----------
  function drawMission() {
    const m = current.mission;
    el.innerHTML = `
      <div class="stack">
        <section class="card hero">
          <div class="upper">${m.comeback ? 'Comeback mission' : `You have ${m.minutes} min available`}</div>
          <div class="mission-title mt-8">"${esc(m.title)}"</div>
          <div class="row wrap mt-8">
            <span class="tag">${esc(ENV_LABEL[m.environment] || m.environment)}</span>
            <span class="tag">${esc(m.level)}</span>
            ${m.lowImpact ? '<span class="tag warn">Low-impact (health)</span>' : ''}
            ${m.comeback ? '<span class="tag warn">Easy restart</span>' : ''}
          </div>
          <div class="move-list">
            ${m.items.map((it, i) => `
              <div class="move-item">
                <span class="n">${i + 1}</span>
                <div class="t"><b>${esc(it.name)}</b><span class="small muted">${fmtTarget(it)}</span></div>
                ${it.cv ? `<span class="cam" title="Camera-verifiable">${ICONS.camera}</span>` : ''}
              </div>`).join('')}
          </div>
          <div class="row between mt-16">
            <span class="muted">Reward</span>
            <b class="accent">up to +${m.maxXp} Fitness XP</b>
          </div>
          ${m.followUp ? `<p class="note mt-16">After class: ${esc(m.followUp.text)}.</p>` : ''}
        </section>
        <button class="btn primary block" id="start">START</button>
        <div class="grid-2">
          <button class="btn ghost" id="shuffle">Shuffle</button>
          <button class="btn ghost" id="change">Change context</button>
        </div>
      </div>`;
    el.querySelector('#start').onclick = () => { current.index = 0; draw(); };
    el.querySelector('#shuffle').onclick = () => generate(current.params);
    el.querySelector('#change').onclick = () => { current = null; draw(); };
  }

  // ---------- 3. Runner ----------
  function next(result) {
    current.results[current.index] = result;
    if (current.index < current.mission.items.length - 1) {
      current.index++;
      draw();
    } else {
      complete();
    }
  }

  function drawRunner() {
    const m = current.mission;
    const i = current.index;
    const it = m.items[i];
    const timed = it.unit === 'sec' && !it.cv;
    el.innerHTML = `
      <div class="stack">
        <div class="progress-dots">${m.items.map((_, j) =>
          `<span class="${j < i ? 'on' : j === i ? 'cur' : ''}"></span>`).join('')}</div>
        <div class="row between">
          <span class="upper">${esc(m.title)}</span>
          <span class="small muted">Move ${i + 1} of ${m.items.length}</span>
        </div>
        <section class="card center" style="padding:28px 18px">
          <div class="runner-name">${esc(it.name)}</div>
          <div class="runner-target mt-16" id="big">${timed ? fmtClock(it.target) : it.target}</div>
          <div class="muted">${timed ? '' : it.unit === 'sec' ? 'seconds' : it.unit}</div>
          <p class="muted mt-16">${esc(it.cue)}</p>
        </section>
        ${it.cv ? `
          <button class="btn primary block" id="verify">${ICONS.camera} Verify with camera</button>
          <button class="btn ghost block" id="manual">Done without camera</button>`
        : timed ? `
          <button class="btn primary block" id="timerBtn">Start timer</button>
          <button class="btn ghost block" id="manual">Mark done</button>`
        : `<button class="btn primary block" id="manual">Done</button>`}
        <div class="row between">
          <button class="link" id="skip" style="color:var(--muted)">Skip this move</button>
          <button class="link" id="end" style="color:var(--muted)">End mission</button>
        </div>
      </div>`;

    el.querySelector('#manual').onclick = () => next({ done: true, verified: false, achieved: it.target });
    el.querySelector('#skip').onclick = () => next({ done: false });
    el.querySelector('#end').onclick = () => {
      if (current.results.some((r) => r?.done)) complete();
      else { current = null; draw(); }
    };

    el.querySelector('#verify')?.addEventListener('click', async () => {
      const r = await openTracker({ type: it.cv, title: it.name, target: it.target });
      if (!r) return;
      if (!r.achieved) return toast('No reps detected. Try again or tap "Done without camera".', true);
      if (r.achieved < it.target) toast(`Verified ${r.achieved}/${it.target} — partial credit`);
      next({ done: true, verified: r.verified, achieved: r.achieved });
    });

    el.querySelector('#timerBtn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (timer) { clearInterval(timer); timer = null; btn.textContent = 'Resume timer'; return; }
      let left = Number(el.querySelector('#big').dataset.left || it.target);
      btn.textContent = 'Pause';
      timer = setInterval(() => {
        left--;
        const big = el.querySelector('#big');
        if (!big) return clearInterval(timer);
        big.dataset.left = left;
        big.textContent = fmtClock(left);
        if (left <= 0) {
          clearInterval(timer);
          timer = null;
          navigator.vibrate?.([80, 60, 80]);
          next({ done: true, verified: false, achieved: it.target });
        }
      }, 1000);
    });
  }

  async function complete() {
    el.innerHTML = '<div class="spinner"></div>';
    try {
      const r = await api(`/missions/${current.mission.id}/complete`, { method: 'POST', body: { results: current.results } });
      current.reward = r.reward;
      current.stats = r.stats;
      store.stats = r.stats;
      app.updateLevelTag();
    } catch (err) {
      toast(err.message, true);
      current.index = Math.max(0, current.mission.items.length - 1);
    }
    draw();
  }

  // ---------- 4. Reward ----------
  function drawReward() {
    const { reward, mission, stats } = current;
    el.innerHTML = `
      <div class="stack center">
        <div class="upper mt-16">Mission complete</div>
        <div class="big-xp">+${reward.xp}</div>
        <div class="muted">Fitness XP</div>
        <section class="card" style="text-align:left">
          ${reward.breakdown.filter((b) => b.xp).map((b) => `<div class="reward-line"><span>${esc(b.label)}</span><b class="accent">+${b.xp}</b></div>`).join('')}
        </section>
        <div class="grid-3">
          <div class="stat"><div class="v">${reward.activeMin}</div><div class="l">active min</div></div>
          <div class="stat"><div class="v">${reward.verifiedCount}</div><div class="l">verified moves</div></div>
          <div class="stat"><div class="v">${stats.streak}</div><div class="l">day streak</div></div>
        </div>
        ${mission.followUp ? `<button class="btn ghost block" id="follow">Set up: ${esc(mission.followUp.text)}</button>` : ''}
        <button class="btn primary block" id="home">Back to dashboard</button>
        <button class="btn ghost block" id="again">Another mission</button>
      </div>`;
    el.querySelector('#home').onclick = () => { current = null; app.navigate('dashboard'); };
    el.querySelector('#again').onclick = () => { current = null; draw(); };
    el.querySelector('#follow')?.addEventListener('click', () => {
      const f = mission.followUp;
      generate({ minutes: f.minutes, environment: f.environment, equipment: [] });
    });
  }

  if (store.missionRequest) {
    const req = store.missionRequest;
    store.missionRequest = null;
    await generate(req);
  } else {
    draw();
  }

  return () => clearInterval(timer);
}

function fmtClock(sec) {
  sec = Math.max(0, sec);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
