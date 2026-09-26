import { api } from '../api.js';
import {
  esc, toast, chips, bindChips, chipValue, fmtDate,
  ENV_OPTIONS, EQUIP_OPTIONS, GOAL_OPTIONS, LEVEL_OPTIONS, MEDICAL_OPTIONS, ICONS,
} from '../ui.js';
import { openTracker } from '../tracker.js';

// Each test maps to a Fit India Fitness Protocol component (shown as `fitIndia`)
const TESTS = [
  { key: 'squats', type: 'squat', title: 'Squats', window: 30, fitIndia: 'Muscular endurance',
    how: 'Whole body in frame (front or side-on). As many good squats as you can in 30 seconds.' },
  { key: 'pushups', type: 'pushup', title: 'Push-ups', window: 30, fitIndia: 'Muscular endurance',
    how: 'Side-on to the camera. Knee or wall push-ups are fine — ATHLORA measures your own growth, not anyone else\'s.' },
  { key: 'jumpingJacks', type: 'jj', title: 'Jumping jacks', window: 30, highImpact: true, fitIndia: 'Cardiovascular endurance',
    how: 'Face the camera with your whole body visible. 30 seconds.' },
  { key: 'plankSec', type: 'plank', title: 'Plank hold', window: null, fitIndia: 'Core strength',
    how: 'Side-on. Hold as long as you comfortably can — the test ends when your hips drop.' },
  { key: 'flexibility', type: 'fold', title: 'Forward fold', window: 15, fitIndia: 'Flexibility',
    how: 'Stand side-on, knees straight. Slowly fold forward and reach toward your toes. Best reach in 15 seconds counts.' },
  { key: 'balanceSec', type: 'balance', title: 'Single-leg balance', window: null, target: 60, fitIndia: 'Balance',
    how: 'Face the camera, hands on hips, lift one foot. Hold as long as you can (max 60 s) — the test ends when your foot touches down.' },
  { key: 'armRaises', type: 'arms', title: 'Seated arm raises', window: 30, seatedOnly: true, fitIndia: 'Muscular endurance',
    how: 'Sit tall facing the camera. Raise both arms fully overhead and lower to shoulder height, as many as you can in 30 seconds.' },
];

let assess = null; // { i, results, verified, done? }
const unitOf = (t) => (t.type === 'plank' || t.type === 'balance' ? 's' : t.type === 'fold' ? 'reach score' : 'reps');
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function render(el, app) {
  const { store } = app;
  const stats = await app.refreshStats();

  function testsFor() {
    const seated = Boolean(store.user.profile.adaptive);
    return TESTS.filter((t) => (seated ? t.seatedOnly : !t.seatedOnly) && !(t.highImpact && store.user.medical?.has));
  }

  function draw() {
    if (assess?.done) return drawAssessResult();
    if (assess) return drawTest();
    drawMain();
  }

  // ---------- main page ----------
  function drawMain() {
    const u = store.user;
    const p = u.profile;
    const med = u.medical || { has: false, conditions: [], notes: '' };
    const sp = u.sports || { plays: false, list: [] };
    const base = stats.baseline, latest = stats.latest;

    el.innerHTML = `
      <div class="stack">
        <div>
          <div class="upper">AI Setup</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:4px">Teach ATHLORA about you</h1>
        </div>

        <section class="card hero">
          <div class="row between"><h2>AI Fitness Baseline</h2>${base ? `<span class="tag lime">${esc(latest.level)}</span>` : '<span class="tag">Not set</span>'}</div>
          <p class="muted small mt-8">${p.adaptive
            ? 'Seated mode: a camera test of seated arm raises builds your fitness profile.'
            : `Computer vision measures ${testsFor().map((t) => t.title.toLowerCase()).join(', ')} and squat-depth mobility, covering the Fit India Fitness Protocol components: muscular endurance, core, ${store.user.medical?.has ? '' : 'cardio, '}flexibility and balance.`}</p>
          <p class="tiny muted mt-8">🔒 Pose detection runs on your device. Video is never recorded or uploaded.</p>
          ${base ? `
            <div class="grid-2 mt-16">
              <div class="stat"><div class="l">Baseline</div><div class="v" style="font-size:16px">${fmtDate(base.createdAt)}</div></div>
              <div class="stat"><div class="l">Latest test</div><div class="v" style="font-size:16px">${fmtDate(latest.createdAt)}</div></div>
            </div>` : ''}
          <button class="btn primary block mt-16" id="startAssess">${ICONS.camera} ${base ? 'Re-assess to measure growth' : `Start ${p.adaptive ? '1' : '3'}-minute assessment`}</button>
        </section>

        <div class="section-title" id="timetable">Class timetable</div>
        <section class="card" id="ttBox"></section>

        <div class="section-title">Your context</div>
        <section class="card">
          <p class="upper">Fitness level</p>
          <div class="mt-8">${chips('level', LEVEL_OPTIONS, p.fitnessLevel)}</div>
          <p class="tiny muted mt-8">${p.levelSource === 'assessment' ? 'Set by your AI assessment.' : p.levelSource === 'manual' ? 'Set manually by you.' : 'Starting estimate — your AI assessment will refine it.'}</p>
          <p class="upper mt-16">Goal</p>
          <div class="mt-8">${chips('goal', GOAL_OPTIONS, p.goal)}</div>
          <p class="upper mt-16">Where you usually are</p>
          <div class="mt-8">${chips('env', ENV_OPTIONS, p.environment)}</div>
          <p class="upper mt-16">Equipment you have</p>
          <div class="mt-8">${chips('equip', EQUIP_OPTIONS, p.equipment, { multi: true })}</div>
          <p class="upper mt-16">Movement mode</p>
          <div class="mt-8">${chips('mode', [['standing', 'Standing'], ['seated', 'Seated / adaptive']], p.adaptive ? 'seated' : 'standing')}</div>
          <p class="tiny muted mt-8">Seated mode builds every mission from chair- and wheelchair-friendly moves, for students with disabilities, injuries or limited mobility.</p>
          <button class="btn ghost block mt-16" id="saveCtx">Save context</button>
        </section>

        <div class="section-title">Health & sports</div>
        <section class="card">
          <p class="upper">Medical conditions</p>
          <div class="mt-8">${chips('medHas', [['no', 'No'], ['yes', 'Yes']], med.has ? 'yes' : 'no')}</div>
          <div id="medBox" ${med.has ? '' : 'hidden'}>
            <div class="mt-8">${chips('medList', MEDICAL_OPTIONS.map((m) => [m, m]), med.conditions, { multi: true })}</div>
            <input class="input mt-8" id="medNotes" placeholder="Notes (optional)" maxlength="300" value="${esc(med.notes)}" />
            <p class="note mt-8">With a condition, missions skip high-impact moves. ATHLORA does not diagnose — check with your doctor.</p>
          </div>
          <p class="upper mt-16">Plays sports</p>
          <div class="mt-8">${chips('spPlays', [['no', 'No'], ['yes', 'Yes']], sp.plays ? 'yes' : 'no')}</div>
          <div id="spBox" ${sp.plays ? '' : 'hidden'}>
            <input class="input mt-8" id="spList" placeholder="e.g. Cricket, Badminton" maxlength="200" value="${esc(sp.list.join(', '))}" />
          </div>
          <button class="btn ghost block mt-16" id="saveHealth">Save health & sports</button>
        </section>
      </div>`;

    bindChips(el, (name, val) => {
      if (name === 'medHas') el.querySelector('#medBox').hidden = val !== 'yes';
      if (name === 'spPlays') el.querySelector('#spBox').hidden = val !== 'yes';
    });

    el.querySelector('#startAssess').onclick = () => {
      assess = { i: 0, results: {}, verified: {} };
      draw();
    };

    drawTimetable();
    if (store.scrollTo === 'timetable') {
      store.scrollTo = null;
      el.querySelector('#timetable').scrollIntoView({ behavior: 'smooth' });
    }

    el.querySelector('#saveCtx').onclick = async () => {
      try {
        const body = {
          goal: chipValue(el, 'goal'),
          environment: chipValue(el, 'env'),
          equipment: chipValue(el, 'equip'),
          adaptive: chipValue(el, 'mode') === 'seated',
        };
        if (chipValue(el, 'level') !== p.fitnessLevel) body.fitnessLevel = chipValue(el, 'level');
        const r = await api('/me/context', { method: 'PUT', body });
        store.user = r.user;
        toast('Context saved');
        drawMain();
      } catch (err) { toast(err.message, true); }
    };

    el.querySelector('#saveHealth').onclick = async () => {
      const has = chipValue(el, 'medHas') === 'yes';
      const plays = chipValue(el, 'spPlays') === 'yes';
      const list = el.querySelector('#spList').value.split(',').map((s) => s.trim()).filter(Boolean);
      if (plays && !list.length) return toast('Add at least one sport', true);
      try {
        const r = await api('/me/context', {
          method: 'PUT',
          body: {
            medical: { has, conditions: has ? chipValue(el, 'medList') : [], notes: has ? el.querySelector('#medNotes').value : '' },
            sports: { plays, list: plays ? list : [] },
          },
        });
        store.user = r.user;
        toast('Saved');
        drawMain();
      } catch (err) { toast(err.message, true); }
    };
  }

  // ---------- timetable editor (feeds the Opportunity Engine) ----------
  const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
  let tt = null;
  let ttDay = new Date().getDay();
  let ttDirty = false;

  function drawTimetable() {
    const box = el.querySelector('#ttBox');
    if (!box) return;
    tt ??= structuredClone(store.user.timetable || { dayStart: '08:00', dayEnd: '18:00', classes: [] });
    const dayClasses = tt.classes.filter((c) => c.day === ttDay).sort((a, b) => a.start.localeCompare(b.start));
    const dayName = DAYS.find(([d]) => d === ttDay)[1];

    box.innerHTML = `
      <p class="muted small">ATHLORA finds the free gaps between your classes and turns each one into a Move Mission, with a reminder when it starts.</p>
      <div class="grid-2 mt-16">
        <div class="field"><label>Your day starts</label><input class="input sm" type="time" id="ttStart" value="${esc(tt.dayStart)}" /></div>
        <div class="field"><label>Your day ends</label><input class="input sm" type="time" id="ttEnd" value="${esc(tt.dayEnd)}" /></div>
      </div>
      <div class="chips mt-16" id="ttDays">
        ${DAYS.map(([d, n]) => {
          const count = tt.classes.filter((c) => c.day === d).length;
          return `<button type="button" class="chip ${d === ttDay ? 'on' : ''}" data-day="${d}">${n}${count ? ` · ${count}` : ''}</button>`;
        }).join('')}
      </div>
      <div class="mt-8">
        ${dayClasses.length ? dayClasses.map((c) => `
          <div class="tt-row">
            <div><b>${esc(c.start)}–${esc(c.end)}</b> <span class="muted">${esc(c.title)}</span></div>
            <button class="link" style="color:var(--danger)" data-del="${esc(c.id)}">Remove</button>
          </div>`).join('') : `<p class="small muted" style="padding:10px 0">No classes on ${dayName} yet.</p>`}
      </div>
      <div class="tt-form mt-8">
        <input class="input sm full" id="ttTitle" placeholder="Class name (e.g. Physics)" maxlength="40" />
        <input class="input sm" type="time" id="ttFrom" aria-label="Start time" />
        <input class="input sm" type="time" id="ttTo" aria-label="End time" />
        <button class="btn sm full" id="ttAdd">+ Add to ${dayName}</button>
      </div>
      ${dayClasses.length ? `<button class="link mt-16" id="ttCopy">Copy ${dayName}'s classes to Mon–Fri</button>` : ''}
      <button class="btn ${ttDirty ? 'primary' : 'ghost'} block mt-16" id="ttSave">${ttDirty ? 'Save timetable' : 'Timetable saved'}</button>`;

    const markDirty = () => { ttDirty = true; drawTimetable(); };
    box.querySelector('#ttStart').onchange = (e) => { tt.dayStart = e.target.value; ttDirty = true; box.querySelector('#ttSave').className = 'btn primary block mt-16'; box.querySelector('#ttSave').textContent = 'Save timetable'; };
    box.querySelector('#ttEnd').onchange = (e) => { tt.dayEnd = e.target.value; ttDirty = true; box.querySelector('#ttSave').className = 'btn primary block mt-16'; box.querySelector('#ttSave').textContent = 'Save timetable'; };
    box.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { ttDay = Number(b.dataset.day); drawTimetable(); });
    box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { tt.classes = tt.classes.filter((c) => c.id !== b.dataset.del); markDirty(); });
    box.querySelector('#ttAdd').onclick = () => {
      const title = box.querySelector('#ttTitle').value.trim() || 'Class';
      const start = box.querySelector('#ttFrom').value;
      const end = box.querySelector('#ttTo').value;
      if (!start || !end) return toast('Pick a start and end time', true);
      if (end <= start) return toast('End time must be after the start time', true);
      const clash = tt.classes.find((c) => c.day === ttDay && start < c.end && end > c.start);
      if (clash) return toast(`Overlaps with ${clash.title} (${clash.start}–${clash.end})`, true);
      tt.classes.push({ id: newId(), day: ttDay, start, end, title });
      markDirty();
    };
    box.querySelector('#ttCopy')?.addEventListener('click', () => {
      const source = tt.classes.filter((c) => c.day === ttDay);
      for (const d of [1, 2, 3, 4, 5]) {
        if (d === ttDay) continue;
        tt.classes = tt.classes.filter((c) => c.day !== d);
        source.forEach((c) => tt.classes.push({ ...c, id: newId(), day: d }));
      }
      toast('Copied to Monday–Friday');
      markDirty();
    });
    box.querySelector('#ttSave').onclick = async () => {
      try {
        const r = await api('/me/timetable', { method: 'PUT', body: tt });
        store.user = r.user;
        tt = structuredClone(r.user.timetable);
        ttDirty = false;
        toast('Timetable saved — check your dashboard for today\'s windows');
        drawTimetable();
      } catch (err) { toast(err.message, true); }
    };
  }

  // ---------- assessment: one test at a time ----------
  function drawTest() {
    const tests = testsFor();
    const t = tests[assess.i];
    el.innerHTML = `
      <div class="stack">
        <div class="progress-dots">${tests.map((_, j) => `<span class="${j < assess.i ? 'on' : j === assess.i ? 'cur' : ''}"></span>`).join('')}</div>
        <div class="row between"><span class="upper">AI Fitness Assessment</span><span class="small muted">Test ${assess.i + 1} of ${tests.length}</span></div>
        <section class="card center" style="padding:26px 18px">
          <div class="tag lime">Fit India · ${esc(t.fitIndia)}</div>
          <div class="runner-name mt-8">${esc(t.title)}</div>
          <div class="runner-target mt-16">${t.window ? `${t.window}s` : t.target ? `max ${t.target}s` : 'Max hold'}</div>
          <p class="muted mt-16">${esc(t.how)}</p>
        </section>
        <p class="small muted center">Prop your phone or laptop 2–3 m away so your whole body fits in the frame.</p>
        <button class="btn primary block" id="cam">${ICONS.camera} Start test with camera</button>
        <p class="tiny muted center">The AI assessment is camera-only, so your baseline and growth are always genuinely measured.</p>
        <div class="row between">
          <button class="link" id="quit" style="color:var(--muted)">Cancel assessment</button>
          <button class="link" id="skip" style="color:var(--muted)">Skip this test</button>
        </div>
      </div>`;

    el.querySelector('#cam').onclick = async () => {
      const r = await openTracker({ type: t.type, title: t.title, window: t.window, target: t.target });
      if (!r) return;
      if (!r.achieved) return toast(t.window ? 'No reps detected. Check you are fully in frame and try again.' : 'No hold detected. Check you are fully in frame and try again.', true);
      assess.results[t.key] = r.achieved;
      assess.verified[t.key] = r.verified;
      if (t.key === 'squats' && r.verified && r.minAngle < 180) {
        // Squat depth -> mobility score (170° standing ... 60° very deep)
        assess.results.mobility = Math.max(0, Math.min(100, Math.round(((170 - r.minAngle) / 110) * 100)));
        assess.verified.mobility = true;
      }
      toast(`${t.title}: ${r.achieved} ${unitOf(t)} ✓${r.form ? ` · Form ${r.form.score}` : ''}`);
      advance();
    };
    el.querySelector('#skip').onclick = advance;
    el.querySelector('#quit').onclick = () => { assess = null; draw(); };
  }

  async function advance() {
    if (assess.i < testsFor().length - 1) {
      assess.i++;
      return draw();
    }
    if (!Object.keys(assess.results).length) {
      toast('No results recorded', true);
      assess = null;
      return draw();
    }
    el.innerHTML = '<div class="spinner"></div><p class="center muted small">Building your fitness profile…</p>';
    try {
      const r = await api('/assessments', { method: 'POST', body: { results: assess.results, verified: assess.verified } });
      store.user = r.user;
      const s = await app.refreshStats();
      assess = { done: true, level: r.level, reward: r.reward, growth: s.growth, first: s.assessments.length === 1 };
      Object.assign(stats, s);
    } catch (err) {
      toast(err.message, true);
      assess = null;
    }
    draw();
  }

  function drawAssessResult() {
    const { level, reward, growth, first } = assess;
    el.innerHTML = `
      <div class="stack center">
        <div class="upper mt-16">${first ? 'Baseline set' : 'Assessment complete'}</div>
        <div class="mission-title" style="text-transform:capitalize">${esc(level)}</div>
        <p class="muted">Your missions now match this level.</p>
        ${growth ? `
          <section class="card">
            <div class="upper">Fitness Growth Index</div>
            <div class="fgi-num ${growth.fgi >= 0 ? 'pos' : 'neg'} mt-8">${growth.fgi >= 0 ? '+' : ''}${growth.fgi}%</div>
            <p class="small muted mt-8">compared with your baseline</p>
          </section>` : `<p class="small muted">Re-assess in a week or two to see your Fitness Growth Index.</p>`}
        <section class="card" style="text-align:left">
          ${reward.breakdown.map((b) => `<div class="reward-line"><span>${esc(b.label)}</span><b class="accent">+${b.xp}</b></div>`).join('')}
        </section>
        <button class="btn primary block" id="toMove">Start a Move Mission</button>
        <button class="btn ghost block" id="back">Done</button>
      </div>`;
    el.querySelector('#toMove').onclick = () => { assess = null; app.navigate('move'); };
    el.querySelector('#back').onclick = () => { assess = null; draw(); };
  }

  draw();
}
