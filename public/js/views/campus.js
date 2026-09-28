import { api } from '../api.js';
import { esc, toast } from '../ui.js';

// Community tab: one shared weekly goal, a compact leaderboard, and move buddies.
const MEDALS = ['🥇', '🥈', '🥉'];
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const initials = (name) => String(name || '?').trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

function moveBadge(move) {
  if (move === 'new') return '<span class="lb-move new">NEW</span>';
  if (move > 0) return `<span class="lb-move up">▲ ${move}</span>`;
  if (move < 0) return `<span class="lb-move down">▼ ${-move}</span>`;
  return '<span class="lb-move same">–</span>';
}

// Weekly goal + stats + your contribution, all in one card
function goalCard(c) {
  const pct = Math.min(100, Math.round((c.totalMin / c.goalMin) * 100));
  const share = c.totalMin > 0 ? Math.round((c.myMin / c.totalMin) * 100) : 0;
  const weekStart = new Date(c.weekStart + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const R = 38, C = 2 * Math.PI * R;
  return `
    <section class="card community-hero">
      <div class="row between" style="align-items:flex-start">
        <div style="min-width:0">
          <div class="upper">Your community</div>
          <h1 class="community-name">${esc(c.campus)}</h1>
        </div>
        <button class="btn sm ghost" id="change">Change</button>
      </div>
      <div class="goal-row mt-16">
        <div class="goal-ring">
          <svg width="92" height="92" viewBox="0 0 92 92">
            <circle cx="46" cy="46" r="${R}" fill="none" stroke="var(--card-2)" stroke-width="9"/>
            <circle cx="46" cy="46" r="${R}" fill="none" stroke="url(#goalGrad)" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" transform="rotate(-90 46 46)"/>
            <defs><linearGradient id="goalGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3fb4ff"/><stop offset="1" stop-color="#6f7dff"/></linearGradient></defs>
          </svg>
          <b>${pct}%</b>
        </div>
        <div style="min-width:0">
          <div class="goal-num"><b>${c.totalMin.toLocaleString()}</b><span> / ${c.goalMin.toLocaleString()} min</span></div>
          <p class="small muted">Weekly goal · since ${weekStart}</p>
          <p class="tiny muted mt-8">Everyone's active minutes fill one shared bar (60 min per member).</p>
        </div>
      </div>
      <div class="mini-stats mt-16">
        <div><b>${c.members}</b><span>members</span></div>
        <div><b>${c.activeMembers}</b><span>moved this week</span></div>
        <div><b>${c.missions}</b><span>missions</span></div>
      </div>
      <div class="contrib mt-16">
        <div style="min-width:0"><span class="tiny muted">Your part this week</span>
          <div><b class="accent">${c.myMin} min</b>${c.myMin > 0 ? ` <span class="small muted">· ${share}% of the total</span>` : ' <span class="small muted">· not yet</span>'}</div></div>
        <button class="btn sm primary" id="move">Add minutes</button>
      </div>
    </section>`;
}

// Top 3 + your own rank; the full list lives on the Leaders tab
function leaderboardCard(lb) {
  if (!lb) return '';
  const me = lb.top.find((r) => r.me) || lb.me;
  const order = [lb.top[1], lb.top[0], lb.top[2]].map((r, i) => ({ r, place: [2, 1, 3][i] })).filter((x) => x.r);
  return `
    <section class="card">
      <div class="row between"><h3>🏆 Leaderboard</h3><a class="link" href="#/leaders">See all ›</a></div>
      <p class="tiny muted mt-8">${esc(lb.label)} · by Fitness XP</p>
      ${lb.top.length ? `
        <div class="podium mini mt-16">
          ${order.map(({ r, place }) => `
            <div class="podium-col p${place} ${r.me ? 'me' : ''}">
              <div class="podium-medal">${MEDALS[place - 1]}</div>
              <div class="podium-name">${esc(r.name)}</div>
              <div class="podium-xp">${r.xp.toLocaleString()} XP</div>
              <div class="podium-block"><span>${place}</span></div>
            </div>`).join('')}
        </div>
        ${me && me.rank > 3 ? `
          <div class="lb-row me mt-8">
            <span class="lb-rank">${ordinal(me.rank)}</span>
            <span class="lb-name">${esc(me.name)} <span class="tag lime">You</span></span>
            <span class="lb-xp">${me.xp.toLocaleString()} XP</span>${moveBadge(me.move)}
          </div>` : ''}
        ${!me ? '<p class="tiny muted mt-8 center">Earn your first XP to get on the board.</p>' : ''}`
      : '<p class="small muted mt-8">No XP earned here yet. Complete a mission and take 1st place!</p>'}
    </section>`;
}

// Move buddies: avatars, shared streaks, and an "Add buddies" drawer
function buddyCard(b) {
  if (!b) return '';
  const moved = b.buddies.filter((x) => x.movedToday).length;
  return `
    <section class="card">
      <div class="row between"><h3>🤝 Move buddies${b.buddies.length ? ` · ${b.buddies.length}` : ''}</h3>
        ${b.buddies.length ? `<span class="tag ${moved ? 'lime' : ''}">${moved}/${b.buddies.length} moved today</span>` : ''}</div>
      ${b.buddies.length ? `
        <div class="buddy-list mt-8">
          ${b.buddies.map((x) => `
            <div class="buddy-row">
              <span class="avatar ${x.movedToday ? 'on' : ''}" title="${x.movedToday ? 'Moved today' : 'Not moved yet today'}">${esc(initials(x.name))}</span>
              <div class="buddy-main"><b>${esc(x.name)}</b><span class="tiny muted">${x.movedToday ? '✓ moved today' : 'not yet today'}</span></div>
              <span class="tag ${x.sharedStreak ? 'lime' : ''}">🔥 ${x.sharedStreak}</span>
              <button class="link buddy-x" data-remove="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">✕</button>
            </div>
            <div class="row buddy-confirm" data-confirm="${esc(x.id)}" hidden>
              <span class="small">Remove ${esc(x.name)}?</span>
              <button class="btn sm danger" data-yes="${esc(x.id)}">Remove</button>
              <button class="btn sm ghost" data-no="${esc(x.id)}">Keep</button>
            </div>`).join('')}
        </div>
        <p class="tiny muted mt-8">${b.meMovedToday ? 'You moved today ✓' : '<span class="accent">Your turn: move after a buddy for +10 XP.</span>'} A shared streak 🔥 grows on days you both move.</p>`
      : '<p class="small muted mt-8">Pair up with friends. With each one you share a streak that grows on days you both move.</p>'}
      <details class="add-buddies mt-16" ${b.buddies.length ? '' : 'open'}>
        <summary><b>+ Add buddies</b></summary>
        <div class="mt-8">
          <div class="code-row">
            <div><span class="tiny muted">Your code</span><div class="code-inline">${esc(b.code)}</div></div>
            <div class="row" style="gap:6px"><button class="btn sm ghost" id="shareCode">Share</button><button class="btn sm ghost" id="copyCode">Copy</button></div>
          </div>
          <div class="row mt-8">
            <input class="input sm" id="joinCode" placeholder="Friend's code" maxlength="6" style="text-transform:uppercase" />
            <button class="btn sm primary" id="joinBuddy">Add</button>
          </div>
          <p class="tiny muted mt-8">Any number of friends can use your code.</p>
        </div>
      </details>
    </section>`;
}

const institutionLink = `
  <a class="inst-link" href="/institution.html">
    <span>🏫</span><div><b>For PE departments</b><span class="tiny muted">Anonymous community insights · no names</span></div><span class="muted">›</span>
  </a>`;

export async function render(el, app) {
  const { store } = app;

  function bindBuddy(b) {
    if (!b) return;
    const shareText = `Join me on ATHLORA! Add me as a move buddy with code ${b.code} — ${location.origin}`;
    el.querySelector('#shareCode')?.addEventListener('click', async () => {
      if (navigator.share) {
        try { await navigator.share({ title: 'ATHLORA buddy code', text: shareText }); } catch {}
      } else {
        try { await navigator.clipboard.writeText(shareText); toast('Invite message copied'); } catch { toast(`Your code is ${b.code}`); }
      }
    });
    el.querySelector('#copyCode')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.code); toast('Code copied'); } catch { toast(`Your code is ${b.code}`); }
    });
    const join = async () => {
      const code = el.querySelector('#joinCode').value.trim();
      if (code.length < 6) return toast("Enter your friend's 6-character code", true);
      try {
        const r = await api('/buddy/join', { method: 'POST', body: { code } });
        toast(`${r.name} is now your move buddy!`);
        await draw();
      } catch (err) { toast(err.message, true); }
    };
    el.querySelector('#joinBuddy')?.addEventListener('click', join);
    el.querySelector('#joinCode')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    el.querySelectorAll('[data-remove]').forEach((btn) => btn.addEventListener('click', () => {
      el.querySelector(`[data-confirm="${btn.dataset.remove}"]`).hidden = false;
    }));
    el.querySelectorAll('[data-no]').forEach((btn) => btn.addEventListener('click', () => {
      el.querySelector(`[data-confirm="${btn.dataset.no}"]`).hidden = true;
    }));
    el.querySelectorAll('[data-yes]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await api(`/buddy/${encodeURIComponent(btn.dataset.yes)}`, { method: 'DELETE' });
        toast('Buddy removed');
        await draw();
      } catch (err) { toast(err.message, true); }
    }));
  }

  async function draw() {
    const [c, buddy, lb] = await Promise.all([
      api('/campus'),
      api('/buddy').catch(() => null),
      api('/leaderboard').catch(() => null),
    ]);
    el.innerHTML = `
      <div class="stack">
        ${c.campus ? goalCard(c) : joinCard()}
        ${leaderboardCard(lb)}
        ${buddyCard(buddy)}
        ${institutionLink}
      </div>`;
    el.querySelector('#move')?.addEventListener('click', () => app.navigate('move'));
    el.querySelector('#change')?.addEventListener('click', () => {
      el.querySelector('.community-hero').outerHTML = joinCard(c.campus);
      bindJoin();
    });
    bindJoin();
    bindBuddy(buddy);
  }

  function joinCard(existing = '') {
    return `
      <section class="card community-hero" id="joinBox">
        <div class="upper">Community</div>
        <h1 class="community-name">${existing ? 'Change community' : 'Move together'}</h1>
        <p class="muted small mt-8">Join your college, class, hostel or club. Everyone's active minutes fill one shared weekly goal.</p>
        <div class="row mt-16">
          <input class="input" id="campus" maxlength="80" placeholder="e.g. IIT Delhi, or Hostel 4 Block B" value="${esc(existing)}" />
          <button class="btn primary" id="join">${existing ? 'Save' : 'Join'}</button>
        </div>
        <p class="tiny muted mt-8">Use exactly the same name as your friends to land on the same team.</p>
      </section>`;
  }

  function bindJoin() {
    const btn = el.querySelector('#join');
    if (!btn) return;
    const go = async () => {
      const name = el.querySelector('#campus').value.trim();
      if (name.length < 2) return toast('Enter your community name', true);
      try {
        const r = await api('/me/context', { method: 'PUT', body: { campus: name } });
        store.user = r.user;
        toast('Joined ' + name);
        await draw();
      } catch (err) { toast(err.message, true); }
    };
    btn.addEventListener('click', go);
    el.querySelector('#campus').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  await draw();
}
