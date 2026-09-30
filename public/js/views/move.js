import { api } from '../api.js';
import { esc, toast, chips, bindChips, chipValue, fmtTarget, TIME_OPTIONS, ENV_OPTIONS, EQUIP_OPTIONS, ICONS } from '../ui.js';
import { openTracker } from '../tracker.js';
import { openStepTracker, motionSupported } from '../sensors.js';
import { hasDemo, stillSVG, feelLegend, openPreview, PREVIEW_SEC } from '../demo.js';
import { primeAudio, tick, ting } from '../sound.js';

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
          <p class="upper mt-16">How do you want to move?</p>
          <div class="mt-8">${chips('pose', [['standing', 'Standing'], ['seated', '🪑 Sitting only']], p.adaptive ? 'seated' : 'standing')}</div>
          <p class="upper mt-16">Equipment nearby <span style="text-transform:none;letter-spacing:0">(optional)</span></p>
          <div class="mt-8">${chips('equip', EQUIP_OPTIONS, p.equipment || [], { multi: true })}</div>
          <p class="tiny muted mt-8">Pick Stairs and your mission includes a short stair climb.</p>
          <button class="btn primary block mt-16" id="gen">Generate Move Mission</button>
        </section>
        <p class="small muted center">Tip: moves with ${ICONS.camera} can be verified by your camera for 1.5× XP.</p>
      </div>`;
    bindChips(el);
    el.querySelector('#gen').onclick = () => generate({
      minutes: Number(chipValue(el, 'time')),
      environment: chipValue(el, 'env'),
      equipment: chipValue(el, 'equip'),
      seated: chipValue(el, 'pose') === 'seated',
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
            ${m.adaptive ? '<span class="tag lime">Seated mode</span>' : ''}
            ${(m.healthLabels || []).map((l) => `<span class="tag lime">🩺 ${esc(l)}</span>`).join('')}
            ${m.comeback ? '<span class="tag warn">Easy restart</span>' : ''}
          </div>
          <div class="move-list">
            ${m.items.map((it, i) => `
              <div class="move-item">
                ${hasDemo(it.moveId)
                  ? `<button class="thumb" data-preview="${i}" aria-label="Preview ${esc(it.name)}">${stillSVG(it.moveId)}<span class="thumb-n">${i + 1}</span></button>`
                  : `<span class="n">${i + 1}</span>`}
                <div class="t"><b>${esc(it.name)}</b><span class="small muted">${fmtTarget(it)}${it.personalized
                  ? ` · <span class="accent">🧠 ${it.target > it.baseTarget ? '+' : ''}${it.target - it.baseTarget} for you</span>` : ''}</span></div>
                ${it.cv ? `<span class="cam" title="Camera-verifiable">${ICONS.camera}</span>` : it.sensor ? '<span class="cam" title="Phone-sensor verifiable">👟</span>' : ''}
              </div>`).join('')}
          </div>
          <div class="row between mt-16">
            <span class="muted">Reward</span>
            <b class="accent">up to +${m.maxXp} Fitness XP</b>
          </div>
          ${m.items.some((it) => it.personalized) ? '<p class="tiny muted mt-8">🧠 Targets marked "for you" were learned from your own verified results.</p>' : ''}
          ${m.healthLabels?.length ? '<p class="tiny muted mt-8">🩺 Built from your health-safe plan. Go at your own pace and stop if anything hurts.</p>' : ''}
          ${m.note ? `<p class="note mt-16">${esc(m.note)}</p>` : ''}
          ${m.followUp ? `<p class="note mt-16">After class: ${esc(m.followUp.text)}.</p>` : ''}
        </section>
        <button class="btn primary block" id="start">START</button>
        <div class="grid-2">
          <button class="btn ghost" id="shuffle">Shuffle</button>
          <button class="btn ghost" id="change">Change context</button>
        </div>
      </div>`;
    el.querySelector('#start').onclick = () => { current.index = 0; draw(); };
    el.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', () => {
      const it = m.items[Number(b.dataset.preview)];
      openPreview(it.moveId, { title: esc(it.name), cue: esc(it.cue), startLabel: 'Close' });
    }));
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
        <section class="card center" style="padding:22px 18px 28px">
          ${hasDemo(it.moveId) ? `
            <button class="demo-badge" id="previewBadge" aria-label="Preview ${esc(it.name)}">${stillSVG(it.moveId)}</button>
            <div class="feel-legend center-legend mt-8">${feelLegend(it.moveId)}</div>
            <button class="btn sm ghost mt-8" id="previewBtn">▶ Preview (${PREVIEW_SEC} s)</button>` : ''}
          <div class="runner-name mt-16">${esc(it.name)}</div>
          <div class="runner-target mt-16" id="big">${timed ? fmtClock(it.target) : it.target}</div>
          <div class="muted">${timed ? '' : it.unit === 'sec' ? 'seconds' : it.unit}</div>
          <p class="muted mt-16">${esc(it.cue)}</p>
        </section>
        ${it.cv ? `
          <button class="btn primary block" id="verify">${ICONS.camera} Verify with camera</button>
          ${it.sensor && motionSupported() ? '<button class="btn ghost block" id="stepsBtn">👟 Or track with phone sensors</button>' : ''}
          <button class="btn ghost block" id="manual">Done without camera</button>
          <p class="tiny muted center">Camera-verified moves earn 1.5× XP and teach ATHLORA your level.</p>`
        : it.sensor && motionSupported() ? `
          <button class="btn primary block" id="stepsBtn">👟 Track with phone sensors</button>
          <button class="btn ghost block" id="manual">Mark done without tracking</button>`
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
    const preview = async () => {
      const go = await openPreview(it.moveId, { title: esc(it.name), cue: esc(it.cue), startLabel: it.cv ? 'Start with camera' : 'Got it' });
      if (go === 'start' && it.cv) el.querySelector('#verify')?.click();
    };
    el.querySelector('#previewBtn')?.addEventListener('click', preview);
    el.querySelector('#previewBadge')?.addEventListener('click', preview);
    el.querySelector('#end').onclick = () => {
      if (current.results.some((r) => r?.done)) complete();
      else { current = null; draw(); }
    };

    el.querySelector('#verify')?.addEventListener('click', async () => {
      const r = await openTracker({ type: it.cv, title: it.name, target: it.target, demo: it.moveId });
      if (!r) return;
      if (!r.achieved) return toast(`No ${it.unit === 'sec' ? 'activity' : 'reps'} detected. Try again or tap "Done without camera".`, true);
      const result = { done: true, verified: r.verified, achieved: r.achieved, formScore: r.form?.score ?? null, formTip: r.form?.tip ?? null };
      if (r.form) return showForm(it, r, result);
      if (r.achieved < it.target) toast(`Verified ${r.achieved}/${it.target} — partial credit`);
      next(result);
    });

    el.querySelector('#stepsBtn')?.addEventListener('click', async () => {
      const r = await openStepTracker({ title: it.name, unit: it.unit, target: it.target });
      if (!r) return;
      if (!r.steps) return toast('No steps detected. Try again with the phone in your hand or pocket.', true);
      toast(r.verified
        ? `👟 ${r.steps} steps · ${r.cadence} steps/min — sensor-verified ✓`
        : `👟 ${r.steps} steps counted — not enough to verify, counted as done`);
      next({ done: true, verified: r.verified, achieved: r.achieved || (r.verified ? it.target : Math.max(1, r.achieved)), steps: r.steps, cadence: r.cadence });
    });

    el.querySelector('#timerBtn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (timer) { clearInterval(timer); timer = null; btn.textContent = 'Resume timer'; return; }
      primeAudio();
      let left = Number(el.querySelector('#big').dataset.left || it.target);
      btn.textContent = 'Pause';
      timer = setInterval(() => {
        left--;
        const big = el.querySelector('#big');
        if (!big) return clearInterval(timer);
        big.dataset.left = left;
        big.textContent = fmtClock(left);
        // Silent countdown; tick through the last 5 seconds only
        if (left >= 1 && left <= 5) tick();
        if (left <= 0) {
          clearInterval(timer);
          timer = null;
          ting();
          navigator.vibrate?.([80, 60, 80]);
          setTimeout(() => next({ done: true, verified: false, achieved: it.target }), 900);
        }
      }, 1000);
    });
  }

  // After a camera-verified move: show the AI form score and one coaching tip
  function showForm(it, r, result) {
    const f = r.form;
    const color = f.score >= 80 ? 'var(--accent)' : f.score >= 60 ? 'var(--warn)' : 'var(--danger)';
    el.innerHTML = `
      <div class="stack center">
        <div class="upper mt-16">${esc(it.name)} · verified ✓</div>
        <div class="big-xp" style="color:${color}">${f.score}</div>
        <div class="muted">Form quality / 100</div>
        <section class="card" style="text-align:left">
          <div class="row between"><span class="muted">Counted</span><b>${r.achieved}${it.unit === 'sec' ? ' s' : ''} / ${it.target}${it.unit === 'sec' ? ' s' : ''}</b></div>
          <div class="row between mt-8"><span class="muted">Reps analysed</span><b>${f.reps}</b></div>
          <p class="mt-16"><b>Coach tip:</b> ${esc(f.tip)}</p>
          ${f.score >= 80 ? '<p class="small accent mt-8">Good form bonus unlocked for this move (+20% XP).</p>' : '<p class="small muted mt-8">Score 80+ earns a good form bonus.</p>'}
        </section>
        <button class="btn primary block" id="cont">Continue</button>
      </div>`;
    el.querySelector('#cont').onclick = () => next(result);
  }

  async function complete() {
    el.innerHTML = '<div class="spinner"></div>';
    try {
      const r = await api(`/missions/${current.mission.id}/complete`, { method: 'POST', body: { results: current.results } });
      current.reward = r.reward;
      current.adaptations = r.adaptations || [];
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
    const { reward, mission, stats, adaptations = [] } = current;
    const unitOf = (a) => (a.unit === 'sec' ? ' s' : a.unit === 'floors' ? ' floors' : '');
    el.innerHTML = `
      <div class="stack center">
        <div class="upper mt-16">Mission complete</div>
        <div class="big-xp">+${reward.xp}</div>
        <div class="muted">Fitness XP</div>
        <section class="card streak-banner on" style="text-align:left;align-items:center">
          <div class="streak-num"><b>${stats.streak}</b><span>day${stats.streak === 1 ? '' : 's'}</span></div>
          <div>
            <h2 style="font-size:18px">🔥 Let's go! ${stats.streak}-day streak!</h2>
            <p class="small muted mt-8">${stats.streak === 1 ? 'Day 1 done. Come back tomorrow for day 2!' : `You've moved ${stats.streak} days in a row. See you tomorrow for day ${stats.streak + 1}!`}</p>
          </div>
        </section>
        <section class="card" style="text-align:left">
          ${reward.breakdown.filter((b) => b.xp).map((b) => `<div class="reward-line"><span>${esc(b.label)}</span><b class="accent">+${b.xp}</b></div>`).join('')}
        </section>
        <div class="grid-2">
          <div class="stat"><div class="v">${reward.activeMin}</div><div class="l">active min</div></div>
          <div class="stat"><div class="v">${reward.verifiedCount}</div><div class="l">verified moves</div></div>
          <div class="stat"><div class="v">${stats.streak}</div><div class="l">day streak</div></div>
          <div class="stat"><div class="v">${reward.formAvg ?? '—'}</div><div class="l">avg form score</div></div>
        </div>
        ${reward.steps ? `<p class="small muted">👟 ${reward.steps} sensor-verified steps</p>` : ''}
        ${adaptations.length ? `
          <section class="card" style="text-align:left">
            <div class="upper">🧠 ATHLORA adapted to you</div>
            ${adaptations.map((a) => `
              <div class="reward-line"><span>${esc(a.name)}</span>
                <b style="color:${a.direction === 'up' ? 'var(--accent)' : 'var(--warn)'}">${a.from}${unitOf(a)} → ${a.to}${unitOf(a)} ${a.direction === 'up' ? '↑' : '↓'}</b></div>`).join('')}
            <p class="tiny muted mt-8">${adaptations.some((a) => a.direction === 'up')
              ? 'Two strong, verified sessions in a row, so your next target is a little higher.'
              : 'It felt tough twice in a row, so your next target is a little easier. That\'s how progress sticks.'}</p>
          </section>` : ''}
        ${mission.followUp ? `<button class="btn ghost block" id="follow">Set up: ${esc(mission.followUp.text)}</button>` : ''}
        ${store.returnTo === 'study' ? '<button class="btn primary block" id="backStudy">Back to studying 📚</button>' : ''}
        <button class="btn ${store.returnTo === 'study' ? 'ghost' : 'primary'} block" id="home">Back to dashboard</button>
        <button class="btn ghost block" id="again">Another mission</button>
      </div>`;
    el.querySelector('#home').onclick = () => { current = null; app.navigate('dashboard'); };
    el.querySelector('#backStudy')?.addEventListener('click', () => { current = null; app.navigate('study'); });
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
