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
            ${path ? `<path d="${path}" fill="${i === trend.length - 1 ? 'var(--accent)' : '#7d9a3a'}" />` : ''}
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
                return `<td title="${DAYS[d]} ${heat.slots[s]}: ${v} missions" style="background:${v ? `rgba(198,255,61,${a.toFixed(2)})` : 'var(--card-2)'};color:${a > 0.55 ? 'var(--accent-ink)' : 'var(--muted)'}">${v || ''}</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="row small muted mt-8" style="gap:8px">
      <span>Fewer</span>
      ${[0.15, 0.4, 0.7, 1].map((a) => `<span style="width:18px;height:12px;border-radius:3px;background:rgba(198,255,61,${a})"></span>`).join('')}
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
        <button class="btn sm ghost" id="refresh">Refresh</button>
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
}

const s = saved();
if (s) open(s.campus, s.pin, (m) => drawLogin(m));
else drawLogin();
