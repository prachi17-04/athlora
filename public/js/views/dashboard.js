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
  const [stats, opps, buddy] = await Promise.all([
    app.refreshStats(),
    api('/opportunities').catch(() => null),
    api('/buddy').catch(() => null),
  ]);
  const u = store.user;
  stats.userName = u.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  el.innerHTML = `
    <div class="stack">
      <div>
        <p class="muted">${greet},</p>
        <h1 style="font-size:28px;font-weight:800">${esc(u.name)}</h1>
      </div>

      ${streakBanner(stats)}

      <section class="card hero">
        <h2>How much time do you have?</h2>
        <p class="muted small mt-8">ATHLORA turns it into a Move Mission that fits where you are right now.</p>
        <div class="mt-16">${chips('time', TIME_OPTIONS, '5')}</div>
        <p class="upper mt-16">Where are you?</p>
        <div class="mt-8">${chips('env', ENV_OPTIONS, u.profile.environment || 'room')}</div>
        <button class="btn primary block mt-16" id="findMission">Find my Move Mission</button>
      </section>

      ${comebackCard(stats)}

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
}
