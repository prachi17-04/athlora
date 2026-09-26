import { esc, fmtDate } from '../ui.js';

const TEST_LABELS = {
  squats: 'Squats (30s)', pushups: 'Push-ups (30s)', jumpingJacks: 'Jumping jacks (30s)',
  plankSec: 'Plank hold (s)', mobility: 'Mobility score', flexibility: 'Forward-fold reach',
  balanceSec: 'Single-leg balance (s)', armRaises: 'Seated arm raises (30s)',
};

const BAND_COLOR = { 'Needs work': 'var(--danger)', Fair: 'var(--warn)', Good: 'var(--blue)', Excellent: 'var(--accent)' };

// Fit India Fitness Protocol component report, from the latest AI assessment
function fitIndiaCard(s) {
  if (!s.fitIndia) return '';
  const before = Object.fromEntries((s.fitIndiaBaseline || []).map((c) => [c.key, c]));
  return `
    <section class="card">
      <div class="row between"><div class="upper">Fit India Fitness Protocol</div><span class="tag">auto-measured</span></div>
      <p class="small muted mt-8">Your camera tests mapped to the protocol's fitness components.</p>
      <div class="stack mt-16" style="gap:14px">
        ${s.fitIndia.map((c) => c.measured ? `
          <div>
            <div class="row between small"><span>${c.label}</span>
              <span class="row" style="gap:8px"><b>${c.score}</b><span class="tag" style="color:${BAND_COLOR[c.band]}">${c.band}</span></span>
            </div>
            <div class="bar mt-8"><div style="width:${c.score}%"></div></div>
            ${before[c.key]?.measured ? `<p class="tiny muted mt-8">Baseline ${before[c.key].score} → now ${c.score} (${c.score - before[c.key].score >= 0 ? '+' : ''}${c.score - before[c.key].score})</p>` : ''}
          </div>` : `
          <div class="row between small"><span class="muted">${c.label}</span><span class="tiny muted">Not measured yet</span></div>`).join('')}
      </div>
      <p class="tiny muted mt-16">Covers the Fit India Fitness Protocol components that a phone camera can measure. Scores (0–100) and bands are ATHLORA's own indicative ratings, not official protocol norms. Body composition (BMI) is part of the protocol, but ATHLORA doesn't collect body measurements.</p>
    </section>`;
}

// Bar path with 4px rounded top corners, square at the baseline
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function activityChart(days) {
  const W = 340, H = 150, top = 18, bottom = 22, left = 4, right = 4;
  const max = Math.max(10, ...days.map((d) => d.activeMin));
  const plotH = H - top - bottom;
  const slot = (W - left - right) / days.length;
  const bw = slot - 4; // 4px gap = 2px surface spacer each side
  const peak = days.reduce((a, d, i) => (d.activeMin > days[a].activeMin ? i : a), 0);

  const bars = days.map((d, i) => {
    const h = (d.activeMin / max) * plotH;
    const x = left + i * slot + 2;
    const y = top + plotH - h;
    const label = new Date(d.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return `
      <g class="bar-g" data-label="${esc(label)}" data-val="${Math.round(d.activeMin * 10) / 10} min · ${d.missions} mission${d.missions === 1 ? '' : 's'}">
        <rect x="${left + i * slot}" y="${top}" width="${slot}" height="${plotH}" fill="transparent"/>
        ${h > 0 ? `<path d="${barPath(x, y, bw, h)}" fill="var(--accent)"/>` : ''}
        ${i === peak && d.activeMin > 0 ? `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="10" fill="var(--text)">${Math.round(d.activeMin)}</text>` : ''}
        ${i % 2 === days.length % 2 ? '' : `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="var(--muted)">${new Date(d.day + 'T00:00:00').getDate()}</text>`}
      </g>`;
  }).join('');

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Active minutes per day, last 14 days">
      <line x1="0" x2="${W}" y1="${top + plotH}" y2="${top + plotH}" stroke="var(--line)" stroke-width="1"/>
      ${bars}
    </svg>`;
}

function compareBlock(growth, baseline) {
  if (!growth) {
    return `
      <div class="cmp">${Object.entries(baseline.results).map(([k, v]) => `
        <div class="row between small"><span class="muted">${esc(TEST_LABELS[k] || k)}</span><b>${v}</b></div>`).join('')}
      </div>
      <p class="small muted mt-16">Re-assess from AI Setup to see how much you've grown.</p>`;
  }
  return `
    <div class="row small" style="gap:14px;margin-bottom:10px">
      <span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:3px;background:#5a6675"></span>Baseline</span>
      <span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent)"></span>Latest</span>
    </div>
    <div class="stack" style="gap:14px">
      ${growth.perTest.map((p) => {
        const max = Math.max(p.baseline, p.latest, 1);
        return `
          <div class="cmp-row">
            <span>${esc(p.label)}</span>
            <b style="color:${p.pct >= 0 ? 'var(--accent)' : 'var(--warn)'}">${p.pct >= 0 ? '+' : ''}${p.pct}%</b>
            <div class="bars">
              <div class="row" style="gap:8px"><div class="bar" style="flex:1"><div style="width:${(p.baseline / max) * 100}%;background:#5a6675"></div></div><span class="tiny muted" style="width:28px;text-align:right">${p.baseline}</span></div>
              <div class="row" style="gap:8px"><div class="bar" style="flex:1"><div style="width:${(p.latest / max) * 100}%"></div></div><span class="tiny" style="width:28px;text-align:right">${p.latest}</span></div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

export async function render(el, app) {
  const { store } = app;
  const s = await app.refreshStats();
  const u = store.user;
  const g = s.growth;
  const anyActivity = s.last14.some((d) => d.missions > 0);

  const badges = [
    ['1', 'First mission', s.totals.missions >= 1],
    ['3d', '3-day streak', s.bestStreak >= 3],
    ['7d', '7-day streak', s.bestStreak >= 7],
    ['CV', 'First verified move', s.totals.verifiedMoves >= 1],
    ['AI', 'Baseline set', Boolean(s.baseline)],
    ['↑', '+10% growth', Boolean(g && g.fgi >= 10)],
    ['↺', 'Comeback', s.totals.comebacks >= 1],
    ['10', '10 missions', s.totals.missions >= 10],
    ['60', '60 active min', s.totals.activeMin >= 60],
    ['★', 'Great form (80+)', (s.form.avg14 ?? 0) >= 80],
    ['FI', 'All 5 Fit India areas', Boolean(s.fitIndia && s.fitIndia.every((c) => c.measured))],
  ];

  el.innerHTML = `
    <div class="stack">
      <div class="passport">
        <div class="row between">
          <span class="upper" style="color:var(--accent)">Fitness Passport</span>
          <span class="pid">ATH-${esc(u.id.slice(0, 8).toUpperCase())}</span>
        </div>
        <div class="pname">${esc(u.name)}</div>
        <dl>
          <div><dt>Level</dt><dd>${s.level} · ${s.xp} XP</dd></div>
          <div><dt>Fitness</dt><dd style="text-transform:capitalize">${esc(u.profile.fitnessLevel)}</dd></div>
          <div><dt>Age</dt><dd>${u.age ?? '—'}</dd></div>
          <div><dt>Goal</dt><dd style="text-transform:capitalize">${esc(u.profile.goal)}</dd></div>
          <div><dt>Sports</dt><dd>${u.sports?.plays ? esc(u.sports.list.join(', ')) : 'None'}</dd></div>
          <div><dt>Member since</dt><dd>${fmtDate(u.createdAt)}</dd></div>
        </dl>
      </div>

      <section class="card">
        <div class="upper">Fitness Growth Index</div>
        ${g ? `
          <div class="fgi-num ${g.fgi >= 0 ? 'pos' : 'neg'} mt-8">${g.fgi >= 0 ? '+' : ''}${g.fgi}%</div>
          <p class="small muted mt-8">Your growth since your baseline on ${fmtDate(s.baseline.createdAt)}. ATHLORA measures how much <i>you</i> improve — not how you compare to athletes.</p>
          <div class="mt-16">${compareBlock(g, s.baseline)}</div>`
        : s.baseline ? `
          <p class="small muted mt-8">Baseline recorded on ${fmtDate(s.baseline.createdAt)}.</p>
          <div class="mt-16">${compareBlock(null, s.baseline)}</div>`
        : `
          <div class="empty mt-16">Set your AI Fitness Baseline to start tracking growth.<br/><br/>
            <button class="btn sm primary" id="toSetup">Go to AI Setup</button></div>`}
      </section>

      ${fitIndiaCard(s)}

      <section class="card">
        <div class="row between"><h3>Active minutes · last 14 days</h3></div>
        <p class="small muted mt-8" id="chartReadout">${anyActivity ? 'Tap a bar for details' : '&nbsp;'}</p>
        <div class="mt-8" style="position:relative">
          ${activityChart(s.last14)}
          ${anyActivity ? '' : '<div class="empty" style="position:absolute;inset:10px 10px 28px;display:grid;place-items:center;background:var(--card)">Complete missions to see your progress here.</div>'}
        </div>
      </section>

      <div class="grid-2">
        <div class="stat"><div class="v">${s.totals.missions}</div><div class="l">Missions completed</div></div>
        <div class="stat"><div class="v">${s.totals.activeMin}</div><div class="l">Active minutes</div></div>
        <div class="stat"><div class="v">${s.totals.verifiedMoves}</div><div class="l">Camera-verified moves</div></div>
        <div class="stat"><div class="v">${s.bestStreak}</div><div class="l">Best streak (days)</div></div>
        <div class="stat" style="grid-column:1/-1">
          <div class="row between"><div><div class="v">${s.form.avg14 ?? '—'}${s.form.avg14 !== null ? '<span class="small muted"> / 100</span>' : ''}</div>
          <div class="l">AI form quality · last 14 days</div></div>
          <span class="tiny muted" style="max-width:55%;text-align:right">${s.form.avg14 !== null ? `from ${s.form.missions} camera-verified mission${s.form.missions === 1 ? '' : 's'}` : 'Verify moves with the camera to get form scores'}</span></div>
        </div>
      </div>

      <div class="section-title">Badges</div>
      <div class="badges">
        ${badges.map(([ico, label, on]) => `<div class="badge ${on ? '' : 'locked'}"><div class="ico">${ico}</div>${esc(label)}</div>`).join('')}
      </div>

      <div class="section-title">Account</div>
      <section class="card">
        <div class="row between small"><span class="muted">Email</span><span>${esc(u.email)}</span></div>
        <p class="tiny muted mt-16">🔒 Privacy: camera analysis runs on your device and video is never uploaded. Your campus and PE department only ever see anonymous totals, never your name.</p>
        <button class="btn danger block mt-16" id="logout">Log out</button>
      </section>
    </div>`;

  el.querySelector('#toSetup')?.addEventListener('click', () => app.navigate('setup'));
  el.querySelector('#logout').onclick = () => app.logout();

  const readout = el.querySelector('#chartReadout');
  el.querySelectorAll('.bar-g').forEach((gEl) => {
    const show = () => {
      if (!anyActivity) return;
      readout.innerHTML = `<b style="color:var(--text)">${gEl.dataset.label}</b> · ${gEl.dataset.val}`;
    };
    gEl.addEventListener('mouseenter', show);
    gEl.addEventListener('click', show);
  });
}
