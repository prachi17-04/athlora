import { esc, fmtAgo, chips, bindChips, chipValue, TIME_OPTIONS, ENV_OPTIONS } from '../ui.js';

// The "Today's Consistency" panel lives ONLY on this page by design.
function consistencyPanel(stats) {
  const t = stats.today;
  const pct = Math.min(1, t.activeMin / t.goalMin);
  const R = 44, C = 2 * Math.PI * R;
  const hour = new Date().getHours();
  let nudge;
  if (t.missions === 0) nudge = hour >= 12 ? "You haven't moved yet today. Even 3 minutes counts." : 'Start your day with a quick Move Mission.';
  else if (t.activeMin < t.goalMin) nudge = `${Math.ceil(t.goalMin - t.activeMin)} more active min to hit today's goal.`;
  else nudge = 'Daily goal hit. Consistency beats intensity.';

  const todayKey = stats.week[stats.week.length - 1].day;
  return `
    <section class="card">
      <div class="row between"><h2>Today's Consistency</h2><span class="tag ${stats.streak ? 'lime' : ''}">${stats.streak} day streak</span></div>
      <div class="ring-wrap mt-16">
        <div class="ring">
          <svg width="104" height="104" viewBox="0 0 104 104">
            <circle cx="52" cy="52" r="${R}" fill="none" stroke="var(--card-2)" stroke-width="10"/>
            <circle cx="52" cy="52" r="${R}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset .6s ease"/>
          </svg>
          <div class="lbl"><div><b>${Math.round(t.activeMin)}</b><span class="tiny muted">/ ${t.goalMin} min</span></div></div>
        </div>
        <div class="stack" style="gap:8px;flex:1">
          <div class="row between"><span class="muted small">Missions today</span><b>${t.missions}</b></div>
          <div class="row between"><span class="muted small">XP today</span><b>${t.xp}</b></div>
          <div class="row between"><span class="muted small">Best streak</span><b>${stats.bestStreak} days</b></div>
        </div>
      </div>
      <div class="week">
        ${stats.week.map((d) => {
          const label = new Date(d.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' });
          return `<div class="d"><div class="dot ${d.missions ? 'on' : ''} ${d.day === todayKey ? 'today' : ''}">${d.missions || ''}</div>${label}</div>`;
        }).join('')}
      </div>
      <p class="small muted mt-16">${nudge}</p>
    </section>`;
}

function comebackCard(stats) {
  if (!stats.comeback) return '';
  const msg = stats.hasActivity
    ? `You were inactive for ${stats.inactiveDays} days. Let's restart with a 4-minute mission.`
    : `You haven't started your first mission yet. Let's begin with 4 easy minutes.`;
  return `
    <section class="card warm">
      <div class="upper" style="color:var(--warn)">Comeback mode</div>
      <h2 class="mt-8">Welcome back, ${esc(stats.userName)}</h2>
      <p class="muted mt-8">${msg}</p>
      <div class="grid-3 mt-16">
        <div class="stat"><div class="l">Difficulty</div><div class="v" style="font-size:17px">Easy</div></div>
        <div class="stat"><div class="l">Duration</div><div class="v" style="font-size:17px">4 mins</div></div>
        <div class="stat"><div class="l">Goal</div><div class="v" style="font-size:14px">Restart consistency</div></div>
      </div>
      <button class="btn primary block mt-16" id="comebackStart">START</button>
    </section>`;
}

export async function render(el, app) {
  const { store } = app;
  const stats = await app.refreshStats();
  const u = store.user;
  stats.userName = u.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const g = stats.growth;

  el.innerHTML = `
    <div class="stack">
      <div>
        <p class="muted">${greet},</p>
        <h1 style="font-size:28px;font-weight:800">${esc(u.name)}</h1>
      </div>

      ${comebackCard(stats)}

      ${consistencyPanel(stats)}

      <section class="card hero">
        <h2>How much time do you have?</h2>
        <p class="muted small mt-8">ATHLORA turns it into a Move Mission that fits where you are right now.</p>
        <div class="mt-16">${chips('time', TIME_OPTIONS, '5')}</div>
        <p class="upper mt-16">Where are you?</p>
        <div class="mt-8">${chips('env', ENV_OPTIONS, u.profile.environment || 'room')}</div>
        <button class="btn primary block mt-16" id="findMission">Find my Move Mission</button>
      </section>

      <div class="grid-2">
        <div class="card">
          <div class="upper">Fitness XP</div>
          <div class="v" style="font-size:30px;font-weight:800;margin-top:6px">${stats.xp}</div>
          <div class="bar mt-8"><div style="width:${Math.round(stats.levelProgress * 100)}%"></div></div>
          <p class="tiny muted mt-8">Level ${stats.level} · ${stats.nextLevelXp - stats.xp} XP to level ${stats.level + 1}</p>
        </div>
        <div class="card" id="fgiTile" style="cursor:pointer">
          <div class="upper">Growth Index</div>
          ${g
            ? `<div class="fgi-num ${g.fgi >= 0 ? 'pos' : 'neg'}" style="font-size:30px;margin-top:6px">${g.fgi >= 0 ? '+' : ''}${g.fgi}%</div>
               <p class="tiny muted mt-8">vs your own baseline</p>`
            : `<div style="font-size:15px;font-weight:600;margin-top:8px">${stats.baseline ? 'Re-test to see growth' : 'Not set yet'}</div>
               <p class="tiny muted mt-8">${stats.baseline ? 'Take another AI assessment' : 'Set your AI baseline'}</p>`}
        </div>
      </div>

      ${!stats.baseline ? `
        <section class="card">
          <div class="row between"><h3>Set your AI Fitness Baseline</h3><span class="tag lime">+40 XP</span></div>
          <p class="muted small mt-8">A 2-minute camera check (squats, push-ups, jumping jacks, plank). ATHLORA uses it to match missions to your level and to measure your growth.</p>
          <button class="btn ghost block mt-16" id="goSetup">Start AI setup</button>
        </section>` : ''}

      <div class="section-title">Recent activity</div>
      ${stats.recent.length
        ? `<section class="card" style="padding:6px 16px">${stats.recent.map((a) => `
            <div class="reward-line">
              <div><b>${esc(a.title)}</b><div class="tiny muted">${fmtAgo(a.completedAt)} · ${a.activeMin} active min${a.verifiedCount ? ` · ${a.verifiedCount} verified` : ''}</div></div>
              <b class="accent">+${a.xp}</b>
            </div>`).join('')}</section>`
        : `<div class="empty">No missions yet. Your first one can take just 3 minutes.</div>`}
    </div>`;

  bindChips(el);
  el.querySelector('#findMission').onclick = () => {
    store.missionRequest = { minutes: Number(chipValue(el, 'time')), environment: chipValue(el, 'env') };
    app.navigate('move');
  };
  el.querySelector('#comebackStart')?.addEventListener('click', () => {
    store.missionRequest = { minutes: 4, environment: u.profile.environment || 'room' };
    app.navigate('move');
  });
  el.querySelector('#goSetup')?.addEventListener('click', () => app.navigate('setup'));
  el.querySelector('#fgiTile').onclick = () => app.navigate(stats.baseline ? 'passport' : 'setup');
}
