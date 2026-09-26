// Institution dashboard for PE departments: anonymous, aggregated community insights.
import { api } from './api.js';
import { esc, toast } from './ui.js';

const root = document.getElementById('root');
const SAVED = 'athlora_institution';
const ENV_LABEL = { room: 'Room', hostel: 'Hostel', classroom: 'Classroom', campus: 'Campus', playground: 'Playground' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function saved() {
  try { return JSON.parse(sessionStorage.getItem(SAVED)) || null; } catch { return null; }
}
function save(v) {
  try { v ? sessionStorage.setItem(SAVED, JSON.stringify(v)) : sessionStorage.removeItem(SAVED); } catch {}
}

const header = (right = '') => `
  <header class="topbar">
    <div class="brand"><img src="/icons/icon.svg" alt="" />ATHLORA</div>
    ${right}
  </header>`;

function drawLogin(msg = '') {
  const last = saved();
  root.innerHTML = `
    ${header('<a class="link" href="/">Student app →</a>')}
    <div class="stack" style="max-width:480px;margin:0 auto">
      <div>
        <div class="upper">Institution dashboard</div>
        <h1 style="font-size:28px;font-weight:800;margin-top:4px">Community movement insights</h1>
        <p class="muted small mt-8">For PE departments and wellness coordinators. See how active your students are, when they move, and which Fit India fitness components need attention. Everything is anonymous and aggregated. No student names are ever shown.</p>
      </div>
      <section class="card">
        <h3>Open dashboard</h3>
        <div class="field mt-16"><label for="c1">Community name (exactly as students entered it)</label><input class="input" id="c1" value="${esc(last?.campus || '')}" placeholder="e.g. IIT Delhi" /></div>
        <div class="field mt-8"><label for="p1">Dashboard PIN</label><input class="input" id="p1" type="password" autocomplete="current-password" /></div>
        <p class="error" id="err1">${esc(msg)}</p>
        <button class="btn primary block" id="open">Open dashboard</button>
      </section>
      <section class="card">
        <h3>First time? Claim your community</h3>
        <p class="tiny muted mt-8">The first staff member to claim a community sets its PIN. Share it only with your department.</p>
        <div class="field mt-16"><label for="c2">Community name</label><input class="input" id="c2" placeholder="e.g. IIT Delhi" /></div>
        <div class="field mt-8"><label for="p2">Create a PIN (6+ characters)</label><input class="input" id="p2" type="password" autocomplete="new-password" /></div>
        <p class="error" id="err2"></p>
        <button class="btn ghost block" id="claim">Claim community dashboard</button>
      </section>
    </div>`;

  root.querySelector('#open').onclick = async () => {
    const campus = root.querySelector('#c1').value.trim();
    const pin = root.querySelector('#p1').value;
    await open(campus, pin, (m) => (root.querySelector('#err1').textContent = m));
  };
  root.querySelector('#claim').onclick = async () => {
    const campus = root.querySelector('#c2').value.trim();
    const pin = root.querySelector('#p2').value;
    const setErr = (m) => (root.querySelector('#err2').textContent = m);
    try {
      await api('/institution/claim', { method: 'POST', body: { campus, pin } });
      toast('Community claimed');
      await open(campus, pin, setErr);
    } catch (err) { setErr(err.message); }
  };
}

async function open(campus, pin, setErr) {
  try {
    const data = await api('/institution/stats', { method: 'POST', body: { campus, pin } });
    save({ campus, pin });
    drawDashboard(data);
  } catch (err) {
    setErr(err.message);
  }
}

function trendChart(trend) {
  const W = 340, H = 150, top = 20, bottom = 24;
  const plotH = H - top - bottom;
  const max = Math.max(30, ...trend.map((t) => t.activeMin));
  const slot = W / trend.length;
  const bw = Math.min(56, slot - 18);
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Active minutes per week, last 4 weeks">
      <line x1="0" x2="${W}" y1="${top + plotH}" y2="${top + plotH}" stroke="var(--line)" />
      ${trend.map((t, i) => {
        const h = (t.activeMin / max) * plotH;
        const x = i * slot + (slot - bw) / 2;
        const y = top + plotH - h;
        const label = new Date(t.weekStart + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        const r = Math.min(4, bw / 2, h);
        const path = h > 0 ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z` : '';
        return `
          <g><title>Week of ${label}: ${t.activeMin} active min, ${t.missions} missions</title>
            ${path ? `<path d="${path}" fill="${i === trend.length - 1 ? 'var(--accent)' : '#1f6fb0'}" />` : ''}
            <text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="var(--text)">${t.activeMin}</text>
            <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${i === trend.length - 1 ? 'This week' : label}</text>
          </g>`;
      }).join('')}
    </svg>`;
}

function heatmap(heat) {
  const max = Math.max(1, ...heat.rows.flat());
  return `
    <div class="table-wrap">
      <table class="heat">
        <thead><tr><th></th>${heat.slots.map((s) => `<th>${s}</th>`).join('')}</tr></thead>
        <tbody>
          ${heat.rows.map((row, d) => `
            <tr><th style="text-align:left">${DAYS[d]}</th>
              ${row.map((v, s) => {
                const a = v ? 0.15 + 0.85 * (v / max) : 0;
                return `<td title="${DAYS[d]} ${heat.slots[s]}: ${v} missions" style="background:${v ? `rgba(63,180,255,${a.toFixed(2)})` : 'var(--card-2)'};color:${a > 0.55 ? 'var(--accent-ink)' : 'var(--muted)'}">${v || ''}</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="row small muted mt-8" style="gap:8px">
      <span>Fewer</span>
      ${[0.15, 0.4, 0.7, 1].map((a) => `<span style="width:18px;height:12px;border-radius:3px;background:rgba(63,180,255,${a})"></span>`).join('')}
      <span>More missions</span>
    </div>`;
}

function drawDashboard(d) {
  const signOut = '<button class="btn sm ghost" id="signout">Sign out</button>';
  if (d.tooSmall) {
    root.innerHTML = `
      ${header(signOut)}
      <div class="stack">
        <div><div class="upper">Institution dashboard</div><h1 style="font-size:28px;font-weight:800;margin-top:4px">${esc(d.campus)}</h1></div>
        <div class="empty">
          <b style="color:var(--text);font-size:20px">${d.members} student${d.members === 1 ? '' : 's'} joined so far</b><br/><br/>
          To protect student privacy, insights appear once at least ${d.minGroup} students have joined this community in the ATHLORA app
          (Community tab → enter "${esc(d.campus)}").
        </div>
      </div>`;
    root.querySelector('#signout').onclick = () => { save(null); drawLogin(); };
    return;
  }

  const w = d.week, l = d.last28;
  const envs = Object.entries(l.environments).sort((a, b) => b[1] - a[1]);
  const envTotal = envs.reduce((s, [, n]) => s + n, 0) || 1;
  const lvlTotal = Object.values(d.levels).reduce((a, b) => a + b, 0) || 1;

  root.innerHTML = `
    ${header(signOut)}
    <div class="stack">
      <div class="row between wrap">
        <div><div class="upper">Institution dashboard · anonymous</div><h1 style="font-size:28px;font-weight:800;margin-top:4px">${esc(d.campus)}</h1></div>
        <div class="row" style="gap:8px">
          <button class="btn sm primary" id="reportBtn">📄 Impact report</button>
          <button class="btn sm ghost" id="refresh">Refresh</button>
        </div>
      </div>

      <div class="kpis">
        <div class="stat"><div class="v">${d.members}</div><div class="l">students joined</div></div>
        <div class="stat"><div class="v">${w.activeShare}%</div><div class="l">active this week (${w.activeStudents})</div></div>
        <div class="stat"><div class="v">${w.avgMinPerStudent}</div><div class="l">active min / student this week</div></div>
        <div class="stat"><div class="v">${l.missions}</div><div class="l">missions · last 28 days</div></div>
        <div class="stat"><div class="v">${l.verifiedShare}%</div><div class="l">moves camera-verified</div></div>
        <div class="stat"><div class="v">${l.avgForm ?? '—'}</div><div class="l">avg AI form score</div></div>
      </div>

      ${d.insights.length ? `
        <section class="card">
          <h3>Suggestions for your department</h3>
          <div class="stack mt-16" style="gap:10px">${d.insights.map((t) => `<div class="insight small">${esc(t)}</div>`).join('')}</div>
        </section>` : ''}

      <div class="two">
        <section class="card">
          <h3>Weekly active minutes</h3>
          <p class="tiny muted mt-8">All students combined, last 4 weeks</p>
          <div class="mt-16">${trendChart(d.trend)}</div>
        </section>
        <section class="card">
          <h3>When students move</h3>
          <p class="tiny muted mt-8">Missions by weekday and time, last 28 days. Empty cells are the best slots for scheduled activity breaks.</p>
          <div class="mt-16">${heatmap(d.heat)}</div>
        </section>
      </div>

      <div class="two">
        <section class="card">
          <h3>Fit India Fitness Protocol: community averages</h3>
          <p class="tiny muted mt-8">Average of students' latest AI assessments (0–100, ATHLORA's indicative scale). Shown only when ${d.minGroup}+ students were measured.</p>
          <div class="stack mt-16" style="gap:12px">
            ${d.fitIndia.map((c) => `
              <div>
                <div class="row between small"><span>${esc(c.label)}</span><b>${c.avg ?? '—'}</b></div>
                <div class="bar mt-8"><div style="width:${c.avg ?? 0}%"></div></div>
                <p class="tiny muted mt-8">${c.students} student${c.students === 1 ? '' : 's'} measured</p>
              </div>`).join('')}
          </div>
        </section>
        <section class="card">
          <h3>Improvement & engagement</h3>
          <div class="grid-2 mt-16">
            <div class="stat"><div class="v">${d.growth.avgFgi === null ? '—' : `${d.growth.avgFgi >= 0 ? '+' : ''}${d.growth.avgFgi}%`}</div><div class="l">avg Fitness Growth Index (${d.growth.students} re-tested)</div></div>
            <div class="stat"><div class="v">${l.comebacks}</div><div class="l">comebacks after inactivity</div></div>
          </div>
          <p class="upper mt-16">Fitness levels</p>
          ${['beginner', 'intermediate', 'advanced'].map((k) => `
            <div class="row between small mt-8"><span style="text-transform:capitalize">${k}</span><b>${d.levels[k]} (${Math.round((d.levels[k] / lvlTotal) * 100)}%)</b></div>`).join('')}
          <p class="upper mt-16">Where students move</p>
          ${envs.length ? envs.map(([k, n]) => `
            <div class="mt-8"><div class="row between small"><span>${esc(ENV_LABEL[k] || k)}</span><b>${Math.round((n / envTotal) * 100)}%</b></div>
            <div class="bar blue mt-8"><div style="width:${(n / envTotal) * 100}%"></div></div></div>`).join('') : '<p class="small muted mt-8">No missions yet.</p>'}
        </section>
      </div>

      <p class="tiny muted center">🔒 Aggregated from students who joined "${esc(d.campus)}" in ATHLORA. No names, emails or individual records are shown, and breakdowns need at least ${d.minGroup} students.</p>
    </div>`;

  root.querySelector('#signout').onclick = () => { save(null); drawLogin(); };
  root.querySelector('#refresh').onclick = async () => {
    const s = saved();
    if (s) await open(s.campus, s.pin, (m) => toast(m, true));
  };
  root.querySelector('#reportBtn').onclick = openReport;
}

// ---------- Impact report (printable + CSV) ----------
async function openReport() {
  const s = saved();
  if (!s) return drawLogin();
  root.innerHTML = '<div class="spinner" style="margin-top:30vh"></div>';
  try {
    const r = await api('/institution/report', { method: 'POST', body: { campus: s.campus, pin: s.pin } });
    drawReport(r);
  } catch (err) {
    toast(err.message, true);
    await open(s.campus, s.pin, (m) => toast(m, true));
  }
}

const fmtDay = (k) => new Date(k + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const delta = (a, b) => { const d = Math.round((b - a) * 10) / 10; return `${d >= 0 ? '+' : ''}${d}`; };

function drawReport(r) {
  const back = `<button class="btn sm ghost no-print" id="back">← Dashboard</button>`;
  if (r.tooSmall || r.noData) {
    root.innerHTML = `${header(back)}<div class="empty">${r.tooSmall
      ? `The impact report needs at least ${r.minGroup} students in "${esc(r.campus)}" (currently ${r.members}).`
      : 'No missions recorded yet, so there is nothing to report.'}</div>`;
    root.querySelector('#back').onclick = () => { const s = saved(); open(s.campus, s.pin, (m) => toast(m, true)); };
    return;
  }
  const e = r.engagement;
  const ba = r.beforeAfter;
  root.innerHTML = `
    ${header(back)}
    <div class="stack" id="report">
      <div>
        <div class="upper">ATHLORA impact report · anonymous</div>
        <h1 style="font-size:28px;font-weight:800;margin-top:4px">${esc(r.campus)}</h1>
        <p class="muted small mt-8">${r.members} students · pilot since ${new Date(r.pilotStart).toLocaleDateString()} · generated ${new Date(r.generatedAt).toLocaleString()}</p>
      </div>

      ${ba ? `
        <section class="card">
          <h3>Before vs after</h3>
          <p class="tiny muted mt-8">First ${ba.weeksEach} week${ba.weeksEach > 1 ? 's' : ''} of the pilot vs the most recent ${ba.weeksEach}.</p>
          <div class="table-wrap mt-16"><table class="rtable">
            <thead><tr><th>Measure</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
            <tbody>${ba.metrics.map((m) => `<tr><td>${esc(m.label)}</td><td>${m.before}</td><td>${m.after}</td>
              <td style="color:${m.after >= m.before ? 'var(--accent)' : 'var(--warn)'};font-weight:700">${delta(m.before, m.after)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>` : ''}

      <div class="kpis">
        <div class="stat"><div class="v">${e.activeMin.toLocaleString()}</div><div class="l">total active minutes</div></div>
        <div class="stat"><div class="v">${e.missions}</div><div class="l">missions completed</div></div>
        <div class="stat"><div class="v">${e.verifiedShare}%</div><div class="l">moves camera/sensor-verified</div></div>
        <div class="stat"><div class="v">${e.avgForm ?? '—'}</div><div class="l">avg AI form score</div></div>
        <div class="stat"><div class="v">${r.growth.avgFgi === null ? '—' : `${r.growth.avgFgi >= 0 ? '+' : ''}${r.growth.avgFgi}%`}</div><div class="l">avg Fitness Growth Index</div></div>
        <div class="stat"><div class="v">${r.growth.improvedShare === null ? '—' : `${r.growth.improvedShare}%`}</div><div class="l">of re-tested students improved (${r.growth.students})</div></div>
        <div class="stat"><div class="v">${e.classBreaks}</div><div class="l">class-break participations</div></div>
        <div class="stat"><div class="v">${e.steps.toLocaleString()}</div><div class="l">sensor-verified steps</div></div>
        <div class="stat"><div class="v">${e.comebacks}</div><div class="l">comebacks after inactivity</div></div>
        <div class="stat"><div class="v">${e.buddyLinks}</div><div class="l">buddy connections</div></div>
        <div class="stat"><div class="v">${e.studyMinutes}</div><div class="l">study minutes with Posture Guardian</div></div>
        <div class="stat"><div class="v">${e.postureGoodPct ?? '—'}${e.postureGoodPct !== null ? '%' : ''}</div><div class="l">study time in good posture</div></div>
      </div>

      <section class="card">
        <h3>Week by week</h3>
        <div class="table-wrap mt-16"><table class="rtable">
          <thead><tr><th>Week of</th><th>Active students</th><th>Moving 3+ days</th><th>Min / student</th><th>Missions</th><th>Verified</th><th>Class breaks</th></tr></thead>
          <tbody>${r.weeks.map((w) => `<tr><td>${fmtDay(w.weekStart)}</td><td>${w.activeStudents} (${w.activeShare}%)</td><td>${w.regularShare}%</td>
            <td>${w.avgMinPerStudent}</td><td>${w.missions}</td><td>${w.verifiedShare}%</td><td>${w.classBreaks}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>

      <section class="card">
        <h3>Fit India components: baseline → latest</h3>
        <p class="tiny muted mt-8">Students with 2+ AI assessments. Shown only when ${r.minGroup}+ students were measured. Scores use ATHLORA's indicative 0–100 scale.</p>
        <div class="table-wrap mt-16"><table class="rtable">
          <thead><tr><th>Component</th><th>Students</th><th>Baseline</th><th>Latest</th><th>Change</th></tr></thead>
          <tbody>${r.fitIndia.map((c) => `<tr><td>${esc(c.label)}</td><td>${c.students}</td>
            <td>${c.baseline ?? '—'}</td><td>${c.latest ?? '—'}</td><td>${c.baseline === null ? '—' : delta(c.baseline, c.latest)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>

      <p class="tiny muted">🔒 Aggregated and anonymous: no names, emails or individual records. Figures come from real ATHLORA activity. Verified moves were confirmed on-device by camera pose detection or phone motion sensors.</p>
      <div class="row wrap no-print" style="gap:10px">
        <button class="btn primary" id="print">Print / Save as PDF</button>
        <button class="btn ghost" id="csv">Download CSV</button>
      </div>
    </div>`;

  root.querySelector('#back').onclick = () => { const s = saved(); open(s.campus, s.pin, (m) => toast(m, true)); };
  root.querySelector('#print').onclick = () => window.print();
  root.querySelector('#csv').onclick = () => downloadCsv(r);
}

function downloadCsv(r) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['ATHLORA impact report (anonymous)'], ['Community', r.campus], ['Students', r.members],
    ['Pilot start', new Date(r.pilotStart).toISOString().slice(0, 10)], ['Generated', new Date(r.generatedAt).toISOString()], [],
    ['Summary'], ...Object.entries(r.engagement).map(([k, v]) => [k, v]),
    ['avgFitnessGrowthIndex', r.growth.avgFgi], ['retestedStudents', r.growth.students], ['improvedSharePct', r.growth.improvedShare], [],
  ];
  if (r.beforeAfter) rows.push(['Before vs after', 'before', 'after'], ...r.beforeAfter.metrics.map((m) => [m.label, m.before, m.after]), []);
  rows.push(['weekStart', 'activeStudents', 'activeSharePct', 'regularSharePct', 'activeMin', 'avgMinPerStudent', 'missions', 'verifiedSharePct', 'classBreaks'],
    ...r.weeks.map((w) => [w.weekStart, w.activeStudents, w.activeShare, w.regularShare, w.activeMin, w.avgMinPerStudent, w.missions, w.verifiedShare, w.classBreaks]), []);
  rows.push(['fitIndiaComponent', 'students', 'baseline', 'latest'], ...r.fitIndia.map((c) => [c.label, c.students, c.baseline, c.latest]));
  const csv = rows.map((row) => row.map(q).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `athlora-impact-${r.campus.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const s = saved();
if (s) open(s.campus, s.pin, (m) => drawLogin(m));
else drawLogin();
