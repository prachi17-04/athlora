import { api } from '../api.js';
import {
  esc, toast, chips, bindChips, chipValue, fmtDate,
  ENV_OPTIONS, EQUIP_OPTIONS, GOAL_OPTIONS, LEVEL_OPTIONS, MEDICAL_OPTIONS, ICONS,
} from '../ui.js';
import { openTracker } from '../tracker.js';

const TESTS = [
  { key: 'squats', type: 'squat', title: 'Squats', window: 30,
    how: 'Whole body in frame (front or side-on). As many good squats as you can in 30 seconds.' },
  { key: 'pushups', type: 'pushup', title: 'Push-ups', window: 30,
    how: 'Side-on to the camera. Knee or wall push-ups are fine — ATHLORA measures your own growth, not anyone else\'s.' },
  { key: 'jumpingJacks', type: 'jj', title: 'Jumping jacks', window: 30, highImpact: true,
    how: 'Face the camera with your whole body visible. 30 seconds.' },
  { key: 'plankSec', type: 'plank', title: 'Plank hold', window: null,
    how: 'Side-on. Hold as long as you comfortably can — the test ends when your hips drop.' },
];

let assess = null; // { i, results, verified, done? }

export async function render(el, app) {
  const { store } = app;
  const stats = await app.refreshStats();

  function testsFor() {
    return TESTS.filter((t) => !(t.highImpact && store.user.medical?.has));
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
          <p class="muted small mt-8">Computer vision analyses squats, push-ups, ${store.user.medical?.has ? '' : 'jumping jacks, '}plank and squat-depth mobility to build your fitness profile. Your video stays on your device.</p>
          ${base ? `
            <div class="grid-2 mt-16">
              <div class="stat"><div class="l">Baseline</div><div class="v" style="font-size:16px">${fmtDate(base.createdAt)}</div></div>
              <div class="stat"><div class="l">Latest test</div><div class="v" style="font-size:16px">${fmtDate(latest.createdAt)}</div></div>
            </div>` : ''}
          <button class="btn primary block mt-16" id="startAssess">${ICONS.camera} ${base ? 'Re-assess to measure growth' : 'Start 2-minute assessment'}</button>
        </section>

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

    el.querySelector('#saveCtx').onclick = async () => {
      try {
        const body = {
          goal: chipValue(el, 'goal'),
          environment: chipValue(el, 'env'),
          equipment: chipValue(el, 'equip'),
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

  // ---------- assessment: one test at a time ----------
  function drawTest() {
    const tests = testsFor();
    const t = tests[assess.i];
    el.innerHTML = `
      <div class="stack">
        <div class="progress-dots">${tests.map((_, j) => `<span class="${j < assess.i ? 'on' : j === assess.i ? 'cur' : ''}"></span>`).join('')}</div>
        <div class="row between"><span class="upper">AI Fitness Assessment</span><span class="small muted">Test ${assess.i + 1} of ${tests.length}</span></div>
        <section class="card center" style="padding:26px 18px">
          <div class="runner-name">${esc(t.title)}</div>
          <div class="runner-target mt-16">${t.window ? `${t.window}s` : 'Max hold'}</div>
          <p class="muted mt-16">${esc(t.how)}</p>
        </section>
        <p class="small muted center">Prop your phone or laptop 2–3 m away so your whole body fits in the frame.</p>
        <button class="btn primary block" id="cam">${ICONS.camera} Start test with camera</button>
        <div id="manualBox" hidden class="row">
          <input class="input" id="manualVal" type="number" inputmode="numeric" min="0" max="500" placeholder="${t.window ? 'Reps' : 'Seconds'}" />
          <button class="btn" id="manualSave">Save</button>
        </div>
        <div class="row between">
          <button class="link" id="manual">Can't use the camera? Enter manually</button>
          <button class="link" id="skip" style="color:var(--muted)">Skip</button>
        </div>
        <button class="link" id="quit" style="color:var(--muted)">Cancel assessment</button>
      </div>`;

    el.querySelector('#cam').onclick = async () => {
      const r = await openTracker({ type: t.type, title: t.title, window: t.window });
      if (!r) return;
      if (!r.achieved) return toast(t.window ? 'No reps detected — try again, or enter manually.' : 'No hold detected — try again.', true);
      assess.results[t.key] = r.achieved;
      assess.verified[t.key] = r.verified;
      if (t.key === 'squats' && r.verified && r.minAngle < 180) {
        // Squat depth -> mobility score (170° standing ... 60° very deep)
        assess.results.mobility = Math.max(0, Math.min(100, Math.round(((170 - r.minAngle) / 110) * 100)));
        assess.verified.mobility = true;
      }
      toast(`${t.title}: ${r.achieved}${t.window ? ' reps' : ' s'} ✓`);
      advance();
    };
    el.querySelector('#manual').onclick = () => { el.querySelector('#manualBox').hidden = false; el.querySelector('#manualVal').focus(); };
    el.querySelector('#manualSave').onclick = () => {
      const v = Number(el.querySelector('#manualVal').value);
      if (!Number.isFinite(v) || v < 0 || v > 500) return toast('Enter a valid number', true);
      assess.results[t.key] = Math.round(v);
      assess.verified[t.key] = false;
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
