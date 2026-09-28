import { api } from '../api.js';
import { esc, chips, bindChips, chipValue, toast, TIME_OPTIONS, ENV_OPTIONS } from '../ui.js';
import { remindersEnabled, remindersSupported, enableReminders, disableReminders, scheduleReminders } from '../reminders.js';

const ENV_LABEL = Object.fromEntries(ENV_OPTIONS);

function inMinutes(start, nowMin) {
  const d = start - nowMin;
  return d < 60 ? `in ${d} min` : `in ${Math.floor(d / 60)} h ${d % 60 ? (d % 60) + ' min' : ''}`.trim();
}

// Timetable-aware Opportunity Engine: today's free windows between classes
// Shown only when the student has added a timetable (in AI Setup) and has classes today
function opportunitiesCard(o) {
  if (!o || !o.configured || !o.hasClassesToday) return '';
  const next = o.items.find((x) => x.status === 'now') || o.items.find((x) => x.status === 'upcoming');
  const reminders = remindersEnabled();
  return `
    <section class="card">
      <div class="row between"><h2>Today's movement windows</h2>
        ${remindersSupported() ? `<button class="btn sm ${reminders ? '' : 'ghost'}" id="remindToggle">${reminders ? '🔔 On' : 'Remind me'}</button>` : ''}
      </div>
      <p class="small muted mt-8">${next
        ? next.status === 'now' ? `<b class="accent">Now:</b> ${esc(next.label)} · ${next.minutes} min free` : `Next window ${inMinutes(next.start, o.nowMin)}: ${esc(next.label)}`
        : 'All of today\'s windows have passed. See you tomorrow!'}</p>
      <div class="mt-8">
        ${o.items.map((op, i) => `
          <div class="opp ${op.status}">
            <span class="time">${op.from}</span>
            <div class="what"><b>${esc(op.label)}</b><span class="tiny muted">${op.minutes} min · ${esc(ENV_LABEL[op.environment] || op.environment)}</span></div>
            ${op.status === 'done' ? '<span class="tag lime">Done ✓</span>'
              : op.status === 'missed' ? '<span class="tag">Missed</span>'
              : `<button class="btn sm ${op.status === 'now' ? 'primary' : 'ghost'}" data-opp="${i}">${op.status === 'now' ? 'START' : 'Go'}</button>`}
          </div>`).join('')}
      </div>
    </section>`;
}

function buddyCard(b) {
  if (!b?.buddies?.length) return '';
  const moved = b.buddies.filter((x) => x.movedToday);
  const shown = b.buddies.slice(0, 6);
  return `
    <section class="card" id="buddyCard" style="cursor:pointer">
      <div class="row between">
        <div><div class="upper">Move buddies · ${b.buddies.length}</div>
          <b style="font-size:17px">${moved.length} of ${b.buddies.length} moved today</b></div>
        <span class="tag ${b.meMovedToday ? 'lime' : 'warn'}">${b.meMovedToday ? 'You ✓' : 'Your turn'}</span>
      </div>
      <div class="chips mt-8">
        ${shown.map((x) => `<span class="tag ${x.movedToday ? 'lime' : ''}">${x.movedToday ? '✓ ' : ''}${esc(x.name)} · 🔥${x.sharedStreak}</span>`).join('')}
        ${b.buddies.length > shown.length ? `<span class="tag">+${b.buddies.length - shown.length} more</span>` : ''}
      </div>
      ${moved.length && !b.meMovedToday ? '<p class="small accent mt-8">Your buddies are moving. Join them and earn the +10 XP buddy bonus!</p>' : ''}
    </section>`;
}

// ---------- Leaderboard: top 3 by XP, then "you" if lower, with today's rank movement ----------
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const MEDALS = ['🥇', '🥈', '🥉'];

function moveBadge(move) {
  if (move === 'new') return '<span class="lb-move new" title="First XP today">NEW</span>';
  if (move > 0) return `<span class="lb-move up" title="Up ${move} today">▲ ${move}</span>`;
  if (move < 0) return `<span class="lb-move down" title="Down ${-move} today">▼ ${-move}</span>`;
  return '<span class="lb-move same" title="No change today">–</span>';
}

function lbRow(r) {
  return `
    <div class="lb-row ${r.me ? 'me' : ''}">
      <span class="lb-rank ${r.rank <= 3 ? 'medal' : ''}">${r.rank <= 3 ? MEDALS[r.rank - 1] : ordinal(r.rank)}</span>
      <span class="lb-name">${esc(r.name)}${r.me ? ' <span class="tag lime">You</span>' : ''}</span>
      <span class="lb-xp">${r.xp.toLocaleString()} XP</span>
      ${moveBadge(r.move)}
    </div>`;
}

function leaderboardInner(lb) {
  if (!lb) return '<p class="small muted mt-8">Leaderboard unavailable right now.</p>';
  return `
    <p class="tiny muted mt-8">${esc(lb.label)} · ranked by Fitness XP · arrows show today's moves</p>
    <div class="mt-8">
      ${lb.top.length ? lb.top.map(lbRow).join('') : '<p class="small muted">No one has earned XP yet. Complete a mission and take 1st place!</p>'}
      ${lb.me ? `<div class="lb-gap">⋯</div>${lbRow(lb.me)}
        <p class="tiny muted mt-8">You're ${ordinal(lb.me.rank)} of ${lb.total}. ${lb.top[2] ? `${(lb.top[2].xp - lb.me.xp + 1).toLocaleString()} XP more to reach the top 3.` : ''}</p>` : ''}
      ${lb.unranked ? '<p class="small muted mt-8">Earn your first XP to join the leaderboard.</p>' : ''}
    </div>`;
}

function leaderboardCard(lb) {
  return `
    <section class="card" id="lbCard">
      <div class="row between wrap">
        <h2>🏆 Leaderboard</h2>
        ${lb?.canSwitch ? `<div class="chips" id="lbScope">
          <button type="button" class="chip sm-chip ${lb.scope === 'community' ? 'on' : ''}" data-scope="community">Community</button>
          <button type="button" class="chip sm-chip ${lb.scope === 'all' ? 'on' : ''}" data-scope="all">Everyone</button></div>` : ''}
      </div>
      <div id="lbBody">${leaderboardInner(lb)}</div>
    </section>`;
}

// Daily streak motivation: "Let's go! You have a __-day streak going on"
const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
const PUSHES = [
  'Small steps every day beat big steps once a week.',
  "You don't need a gym. You need 3 minutes and a reason.",
  'Every mission counts. Future you says thanks.',
  "Consistency is your superpower. Don't break the chain!",
  'Show up today, even for a little bit.',
  "Motivation gets you started. Streaks keep you going.",
  'One more day. One more win.',
];

function streakBanner(stats) {
  const s = stats.streak;
  const movedToday = stats.today.missions > 0;
  const next = MILESTONES.find((m) => m > s);
  let title, sub, cta = null;
  if (s > 0 && movedToday) {
    title = `🔥 Let's go! You have a ${s}-day streak going on!`;
    sub = `Today's done ✓. Come back tomorrow to make it ${s + 1} days.`;
  } else if (s > 0) {
    title = `🔥 Let's go! You have a ${s}-day streak going on!`;
    sub = `Don't let it break. Move today to make it ${s + 1} days. Even 3 minutes counts.`;
    cta = 'Keep my streak alive';
  } else if (stats.bestStreak > 0) {
    title = "💪 Let's go! New day, new streak.";
    sub = `Your best was ${stats.bestStreak} day${stats.bestStreak === 1 ? '' : 's'}. One mission today starts your comeback.`;
    cta = 'Start my streak';
  } else {
    title = "💪 Let's go! Start your streak today.";
    sub = 'Your first mission takes just 3 minutes. Day 1 starts now.';
    cta = 'Start my streak';
  }
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return `
    <section class="card streak-banner ${s > 0 ? 'on' : ''}">
      <div class="streak-num"><b>${s}</b><span>day${s === 1 ? '' : 's'}</span></div>
      <div style="flex:1;min-width:0">
        <h2 style="font-size:18px;line-height:1.25">${title}</h2>
        <p class="small muted mt-8">${sub}</p>
        ${next ? `
          <div class="bar mt-8"><div style="width:${Math.round((s / next) * 100)}%"></div></div>
          <p class="tiny muted mt-8">${next - s} more day${next - s === 1 ? '' : 's'} to your ${next}-day milestone</p>` : ''}
        <p class="tiny mt-8" style="color:var(--text);opacity:.8"><i>${PUSHES[dayOfYear % PUSHES.length]}</i></p>
        ${cta && !stats.comeback ? `<button class="btn primary sm mt-16" id="streakGo">${cta}</button>` : ''}
      </div>
    </section>`;
}

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
  const [stats, opps, buddy, lb] = await Promise.all([
    app.refreshStats(),
    api('/opportunities').catch(() => null),
    api('/buddy').catch(() => null),
    api('/leaderboard').catch(() => null),
  ]);
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

      ${streakBanner(stats)}

      ${comebackCard(stats)}

      ${consistencyPanel(stats)}

      ${leaderboardCard(lb)}

      ${u.medical?.has ? `
        <section class="card health-card" id="healthPlanGo" style="cursor:pointer">
          <div class="row between"><h3>🩺 Your health-safe plan</h3><span class="tag lime">View</span></div>
          <p class="small muted mt-8">See which exercises suit your health and which ATHLORA leaves out for you. Every mission already follows it.</p>
        </section>` : ''}

      ${opportunitiesCard(opps)}

      <section class="card" id="studyGo" style="cursor:pointer">
        <div class="row between">
          <div><div class="upper">Study mode</div><h3 style="margin-top:4px">📚 Posture Guardian</h3></div>
          <span class="tag lime">${stats.study.sessions ? `${stats.study.goodPct ?? '—'}% good posture` : 'New'}</span>
        </div>
        <p class="small muted mt-8">Studying for a while? ATHLORA watches your posture and sitting time on-device, and nudges you to move before it becomes a habit.</p>
      </section>

      ${buddyCard(buddy)}

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
  el.querySelector('#buddyCard')?.addEventListener('click', () => app.navigate('community'));
  el.querySelector('#studyGo').onclick = () => app.navigate('study');
  el.querySelector('#lbScope')?.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-scope]');
    if (!chip || chip.classList.contains('on')) return;
    el.querySelectorAll('#lbScope .chip').forEach((c) => c.classList.toggle('on', c === chip));
    try {
      const next = await api(`/leaderboard?scope=${chip.dataset.scope}`);
      el.querySelector('#lbBody').innerHTML = leaderboardInner(next);
    } catch (err) { toast(err.message, true); }
  });
  el.querySelector('#healthPlanGo')?.addEventListener('click', () => app.navigate('setup'));
  el.querySelector('#streakGo')?.addEventListener('click', () => {
    store.missionRequest = { minutes: 3, environment: u.profile.environment || 'room' };
    app.navigate('move');
  });
  el.querySelectorAll('[data-opp]').forEach((b) => b.addEventListener('click', () => {
    const op = opps.items[Number(b.dataset.opp)];
    // A window that's already open only has the remaining minutes left
    const left = op.status === 'now' ? Math.max(2, op.end - opps.nowMin) : op.minutes;
    store.missionRequest = { minutes: Math.min(op.minutes, left), environment: op.environment };
    app.navigate('move');
  }));
  el.querySelector('#remindToggle')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      if (remindersEnabled()) { disableReminders(); toast('Reminders off'); }
      else { await enableReminders(); toast("Reminders on — we'll nudge you when a window starts"); }
    } catch (err) { toast(err.message, true); }
    btn.textContent = remindersEnabled() ? '🔔 On' : 'Remind me';
    btn.classList.toggle('ghost', !remindersEnabled());
  });
  if (opps) scheduleReminders(opps);
  el.querySelector('#fgiTile').onclick = () => app.navigate(stats.baseline ? 'passport' : 'setup');
}
