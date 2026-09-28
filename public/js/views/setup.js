import { api } from '../api.js';
import {
  esc, toast, chips, bindChips, chipValue, fmtDate,
  ENV_OPTIONS, EQUIP_OPTIONS, GOAL_OPTIONS, LEVEL_OPTIONS, MEDICAL_OPTIONS, ICONS,
} from '../ui.js';
import { openTracker } from '../tracker.js';
import { stillSVG, feelLegend, openPreview, PREVIEW_SEC, TEST_DEMO } from '../demo.js';

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
  let plan = await api('/health-plan').catch(() => ({ active: false, conditions: [], avoidTests: [] }));

  function testsFor() {
    const seated = Boolean(store.user.profile.adaptive);
    const skip = new Set(plan.avoidTests || []);
    return TESTS.filter((t) => (seated ? t.seatedOnly : !t.seatedOnly) && !(t.highImpact && store.user.medical?.has) && !skip.has(t.key));
  }

  // "You told us about X, so these are the exercises for you"
  function healthPlanCard() {
    if (!plan.active) return '';
    const names = plan.conditions.map((c) => c.label.toLowerCase()).join(' and ');
    return `
      <section class="card health-card">
        <div class="row between wrap"><h2>🩺 Your health-safe plan</h2>
          <div class="row wrap" style="gap:6px">${plan.labels.map((l) => `<span class="tag lime">${esc(l)}</span>`).join('')}</div></div>
        <p class="small muted mt-8">You told us about <b style="color:var(--text)">${esc(names)}</b>. ATHLORA builds every mission only from moves that suit you, and leaves out the ones below.</p>
        ${plan.conditions.map((c) => `
          <div class="mt-16">
            <p class="upper">${esc(c.label)}</p>
            <p class="small mt-8"><b>Good for you</b></p>
            <div class="chips mt-8">${c.recommend.map((m) => `<span class="tag lime" title="${esc(m.cue)}">${m.camera ? '📷 ' : m.sensor ? '👟 ' : ''}${esc(m.name)}</span>`).join('')}</div>
            <details class="mt-8">
              <summary class="small"><b>Left out for you</b> <span class="muted">(${c.avoid.length})</span></summary>
              <div class="mt-8">${c.avoid.map((a) => `<div class="reward-line small"><span>${esc(a.name)}</span><span class="muted" style="text-align:right;max-width:60%">${esc(a.reason)}</span></div>`).join('')}</div>
            </details>
            <ul class="small tips mt-8">${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          </div>`).join('')}
        ${plan.capIntensity ? '<p class="small mt-8">💙 Your missions stay at gentle amounts and never auto-increase, however well you do.</p>' : ''}
        ${plan.suggestSeated && !store.user.profile.adaptive ? `
          <div class="note mt-16">While you recover, seated mode keeps every move gentle and chair-based.
            <button class="btn sm mt-8" id="goSeated">Switch to seated mode</button></div>` : ''}
        <button class="btn primary block mt-16" id="healthMission">Start a health-safe mission</button>
        <p class="tiny muted mt-8">General safety guidance, not medical advice. Follow your doctor's or physiotherapist's advice. Stop straight away if you feel pain, dizziness, chest pain or unusual breathlessness.</p>
      </section>`;
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

    // "How well does ATHLORA know you?" checklist
    const ttCount = (u.timetable?.classes || []).length;
    const steps = [
      { id: 'basics', icon: '👤', label: 'Profile & health', done: true, target: 'secHealth' },
      { id: 'baseline', icon: '📷', label: 'AI fitness test', done: Boolean(base) || !testsFor().length, target: 'secBaseline' },
      { id: 'goals', icon: '🎯', label: 'Goals & equipment', done: Boolean(p.contextSaved), target: 'secGoals' },
      { id: 'timetable', icon: '📅', label: 'Class timetable', done: ttCount > 0, target: 'secTimetable' },
      { id: 'community', icon: '👥', label: 'Join a community', done: Boolean(u.campus), target: null },
    ];
    const pct = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
    const R = 34, C = 2 * Math.PI * R;
    const nextStep = steps.find((s) => !s.done);
    const goalLabel = Object.fromEntries(GOAL_OPTIONS)[p.goal] || 'General fitness';
    const envLabel = Object.fromEntries(ENV_OPTIONS)[p.environment] || 'Room';
    const tests = testsFor();
    const retestDays = latest ? Math.max(0, 14 - Math.floor((Date.now() - latest.createdAt) / 86400000)) : null;

    el.innerHTML = `
      <div class="stack">
        <section class="card coach-hero">
          <div class="coach-top">
            <div class="coach-ring">
              <svg width="84" height="84" viewBox="0 0 84 84">
                <circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--card-2)" stroke-width="8"/>
                <circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round"
                  stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" transform="rotate(-90 42 42)"/>
              </svg>
              <b>${pct}%</b>
            </div>
            <div style="flex:1;min-width:0">
              <div class="upper">Your AI coach</div>
              <h1 style="font-size:22px;font-weight:800;margin-top:4px;line-height:1.2">${pct === 100 ? 'ATHLORA knows you well 🎉' : 'Help ATHLORA get to know you'}</h1>
              <p class="small muted mt-8">${nextStep ? `Next: <b style="color:var(--text)">${nextStep.label}</b>. The more it knows, the better your missions fit.` : 'Every mission is now tuned to your level, goals, health and day.'}</p>
            </div>
          </div>
          <div class="coach-steps mt-16">
            ${steps.map((s) => `<button type="button" class="coach-step ${s.done ? 'done' : ''}" data-jump="${s.target || ''}" ${s.id === 'community' ? 'data-nav-to="community"' : ''}>
              <span class="coach-step-icon">${s.done ? '✓' : s.icon}</span><span>${s.label}</span></button>`).join('')}
          </div>
        </section>

        ${healthPlanCard()}

        <section class="card hero" id="secBaseline">
          <div class="row between"><h2>📷 AI fitness test</h2>${base ? `<span class="tag lime" style="text-transform:capitalize">${esc(latest.level)}</span>` : '<span class="tag">Not taken yet</span>'}</div>
          <p class="muted small mt-8">${!tests.length
            ? 'Your health-safe plan pauses the fitness tests for now. Keep moving with gentle missions, and take the test once your doctor clears you.'
            : base
            ? `Last tested ${fmtDate(latest.createdAt)}. ${retestDays ? `Re-test in ${retestDays} day${retestDays === 1 ? '' : 's'} to see how much you've grown.` : 'Re-test now to see how much you\'ve grown!'}`
            : 'A quick camera test finds your starting level, so every mission matches you from day one.'}</p>
          ${tests.length ? `
            <div class="test-strip mt-16">
              ${tests.map((t) => `
                <div class="test-card">
                  <div class="test-pic">${TEST_DEMO[t.key] ? stillSVG(TEST_DEMO[t.key]) : ''}</div>
                  <b>${esc(t.title)}</b>
                  <span class="tiny muted">${t.window ? `${t.window} s` : t.target ? `up to ${t.target} s` : 'max hold'}</span>
                </div>`).join('')}
            </div>
            <button class="btn primary block mt-16" id="startAssess">${ICONS.camera} ${base ? 'Re-test on camera' : `Start ${Math.max(1, Math.ceil(tests.length * 0.6))}-minute test`}</button>` : ''}
          <p class="tiny muted mt-8">🔒 Camera analysis runs on your device. Video is never recorded or uploaded.</p>
        </section>

        <details class="card setup-sec" id="secTimetable" ${ttCount ? '' : 'open'}>
          <summary><span class="sec-icon">📅</span><span class="sec-text"><b>Class timetable</b>
            <span class="tiny muted">${ttCount ? `${ttCount} class${ttCount === 1 ? '' : 'es'} a week · finds your free gaps` : 'Not added yet · find movement windows between classes'}</span></span></summary>
          <div id="ttBox" class="mt-16"></div>
        </details>

        <details class="card setup-sec" id="secGoals">
          <summary><span class="sec-icon">🎯</span><span class="sec-text"><b>Goals & equipment</b>
            <span class="tiny muted">${esc(goalLabel)} · ${esc(envLabel)}${p.equipment?.length ? ` · ${p.equipment.length} equipment` : ''}${p.adaptive ? ' · seated mode' : ''}</span></span></summary>
          <div class="mt-16">
            <p class="upper">Fitness level</p>
            <div class="mt-8">${chips('level', LEVEL_OPTIONS, p.fitnessLevel)}</div>
            <p class="tiny muted mt-8">${p.levelSource === 'assessment' ? 'Set by your AI fitness test.' : p.levelSource === 'manual' ? 'Set manually by you.' : 'Starting estimate. Your AI fitness test will refine it.'}</p>
            <p class="upper mt-16">Goal</p>
            <div class="mt-8">${chips('goal', GOAL_OPTIONS, p.goal)}</div>
            <p class="upper mt-16">Where you usually are</p>
            <div class="mt-8">${chips('env', ENV_OPTIONS, p.environment)}</div>
            <p class="upper mt-16">Equipment you have</p>
            <div class="mt-8">${chips('equip', EQUIP_OPTIONS, p.equipment, { multi: true })}</div>
            <p class="upper mt-16">Movement mode</p>
            <div class="mt-8">${chips('mode', [['standing', 'Standing'], ['seated', 'Seated / adaptive']], p.adaptive ? 'seated' : 'standing')}</div>
            <p class="tiny muted mt-8">Seated mode builds every mission from chair- and wheelchair-friendly moves, for students with disabilities, injuries or limited mobility.</p>
            <button class="btn primary block mt-16" id="saveCtx">Save goals & equipment</button>
          </div>
        </details>

        <details class="card setup-sec" id="secHealth">
          <summary><span class="sec-icon">🩺</span><span class="sec-text"><b>Health & sports</b>
            <span class="tiny muted">${med.has ? `${med.conditions.length ? esc(med.conditions.join(', ')) : 'Condition noted'}` : 'No health conditions'} · ${sp.plays && sp.list.length ? esc(sp.list.join(', ')) : 'no sports'}</span></span></summary>
          <div class="mt-16">
            <p class="upper">Medical conditions</p>
            <div class="mt-8">${chips('medHas', [['no', 'No'], ['yes', 'Yes']], med.has ? 'yes' : 'no')}</div>
            <div id="medBox" ${med.has ? '' : 'hidden'}>
              <div class="mt-8">${chips('medList', MEDICAL_OPTIONS.map((m) => [m, m]), med.conditions, { multi: true })}</div>
              <input class="input mt-8" id="medNotes" placeholder="Notes (optional)" maxlength="300" value="${esc(med.notes)}" />
              <p class="note mt-8">ATHLORA builds a health-safe plan from this. It does not diagnose anything, so please check with your doctor.</p>
            </div>
            <p class="upper mt-16">Plays sports</p>
            <div class="mt-8">${chips('spPlays', [['no', 'No'], ['yes', 'Yes']], sp.plays ? 'yes' : 'no')}</div>
            <div id="spBox" ${sp.plays ? '' : 'hidden'}>
              <input class="input mt-8" id="spList" placeholder="e.g. Cricket, Badminton" maxlength="200" value="${esc(sp.list.join(', '))}" />
            </div>
            <button class="btn primary block mt-16" id="saveHealth">Save health & sports</button>
          </div>
        </details>
      </div>`;


    bindChips(el, (name, val) => {
      if (name === 'medHas') el.querySelector('#medBox').hidden = val !== 'yes';
      if (name === 'spPlays') el.querySelector('#spBox').hidden = val !== 'yes';
    });

    el.querySelector('#startAssess')?.addEventListener('click', () => {
      assess = { i: 0, results: {}, verified: {} };
      draw();
    });
    el.querySelector('#healthMission')?.addEventListener('click', () => {
      store.missionRequest = { minutes: 5, environment: p.environment || 'room' };
      app.navigate('move');
    });
    el.querySelector('#goSeated')?.addEventListener('click', async () => {
      try {
        const r = await api('/me/context', { method: 'PUT', body: { adaptive: true } });
        store.user = r.user;
        toast('Seated mode on: every mission is now chair-based');
        drawMain();
      } catch (err) { toast(err.message, true); }
    });

    drawTimetable();
    el.querySelectorAll('.coach-step').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.navTo) return app.navigate(b.dataset.navTo);
      const sec = b.dataset.jump && el.querySelector('#' + b.dataset.jump);
      if (!sec) return;
      if (sec.tagName === 'DETAILS') sec.open = true;
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    if (store.scrollTo === 'timetable') {
      store.scrollTo = null;
      const sec = el.querySelector('#secTimetable');
      sec.open = true;
      sec.scrollIntoView({ behavior: 'smooth' });
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
        toast('Goals & equipment saved');
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
        plan = await api('/health-plan').catch(() => plan);
        toast(plan.active ? 'Saved. Your health-safe plan is updated above' : 'Saved');
        drawMain();
        if (plan.active) el.querySelector('.health-card')?.scrollIntoView({ behavior: 'smooth' });
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
          ${TEST_DEMO[t.key] ? `
            <button class="demo-badge" id="previewBadge" aria-label="Preview ${esc(t.title)}">${stillSVG(TEST_DEMO[t.key])}</button>
            <div class="feel-legend center-legend mt-8">${feelLegend(TEST_DEMO[t.key])}</div>
            <button class="btn sm ghost mt-8" id="previewBtn">▶ Preview (${PREVIEW_SEC} s)</button>
            <div class="mt-16"></div>` : ''}
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
      const r = await openTracker({ type: t.type, title: t.title, window: t.window, target: t.target, demo: TEST_DEMO[t.key] });
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
    const preview = async () => {
      const go = await openPreview(TEST_DEMO[t.key], { title: esc(t.title), cue: esc(t.how), startLabel: 'Start test with camera' });
      if (go === 'start') el.querySelector('#cam')?.click();
    };
    el.querySelector('#previewBtn')?.addEventListener('click', preview);
    el.querySelector('#previewBadge')?.addEventListener('click', preview);
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
