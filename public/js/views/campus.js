import { api } from '../api.js';
import { esc, toast } from '../ui.js';

// Move buddies: add as many friends as you like. Each friendship has its own shared streak.
// Social motivation without any scoreboard or comparison.
function buddySection(b) {
  if (!b) return '';
  const moved = b.buddies.filter((x) => x.movedToday).length;
  return `
    <div class="section-title">Move buddies${b.buddies.length ? ` · ${b.buddies.length}` : ''}</div>
    <section class="card">
      ${b.buddies.length ? `
        <p class="small muted">${moved} of ${b.buddies.length} ${b.buddies.length === 1 ? 'buddy has' : 'buddies have'} moved today · ${b.meMovedToday ? 'you did ✓' : '<span class="accent">your turn!</span>'}</p>
        <div class="mt-8">
          ${b.buddies.map((x) => `
            <div class="opp" data-buddy="${esc(x.id)}">
              <div class="what">
                <b>${esc(x.name)}</b>
                <span class="tiny muted">${x.movedToday ? '✓ moved today' : 'not moved yet today'}</span>
              </div>
              <span class="tag ${x.sharedStreak ? 'lime' : ''}">🔥 ${x.sharedStreak} day${x.sharedStreak === 1 ? '' : 's'}</span>
              <button class="link" style="color:var(--muted);padding:4px 6px" data-remove="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">✕</button>
            </div>
            <div class="row mt-8" data-confirm="${esc(x.id)}" hidden>
              <span class="small">Remove ${esc(x.name)}?</span>
              <button class="btn sm danger" data-yes="${esc(x.id)}">Remove</button>
              <button class="btn sm ghost" data-no="${esc(x.id)}">Keep</button>
            </div>`).join('')}
        </div>
        <p class="tiny muted mt-8">Each shared streak grows only on days you <b>both</b> move. The first time you move each day after any buddy already has, you get +10 XP.</p>`
      : `<h2>Move with friends</h2>
         <p class="muted small mt-8">Add as many buddies as you like. With each one you share a streak that grows only on days you both move. There's no scoreboard and no comparison, just friends counting on each other.</p>`}
      <p class="upper mt-16">Your buddy code</p>
      <div class="code-box mt-8">${esc(b.code)}</div>
      <div class="grid-2 mt-8">
        <button class="btn sm ghost" id="shareCode">Share code</button>
        <button class="btn sm ghost" id="copyCode">Copy code</button>
      </div>
      <p class="tiny muted mt-8">Any number of friends can use this code.</p>
      <p class="upper mt-16">Add a buddy</p>
      <div class="row mt-8">
        <input class="input sm" id="joinCode" placeholder="Friend's code" maxlength="6" style="text-transform:uppercase" />
        <button class="btn sm" id="joinBuddy">Add</button>
      </div>
    </section>`;
}

// Community challenge: everyone moves one shared bar. No rankings, no leaderboard.
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

  const institutionLink = `
    <a class="card" href="/institution.html" style="display:block;text-decoration:none;color:inherit">
      <div class="row between"><div><div class="upper">For PE departments</div><b>Institution dashboard →</b></div></div>
      <p class="tiny muted mt-8">Anonymous community-wide insights: activity trends, when students move, Fit India component averages. No names, ever.</p>
    </a>`;

  async function draw() {
    const [c, buddy] = await Promise.all([api('/campus'), api('/buddy').catch(() => null)]);
    if (!c.campus) {
      drawJoin();
      el.querySelector('.stack').insertAdjacentHTML('beforeend', buddySection(buddy) + institutionLink);
      bindBuddy(buddy);
      return;
    }

    const pct = Math.min(100, Math.round((c.totalMin / c.goalMin) * 100));
    const myShare = c.totalMin > 0 ? Math.round((c.myMin / c.totalMin) * 100) : 0;
    const weekStart = new Date(c.weekStart + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    el.innerHTML = `
      <div class="stack">
        <div>
          <div class="upper">Community Challenge</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:4px">${esc(c.campus)}</h1>
          <p class="muted small mt-8">One shared goal. No rankings — every member who moves pushes the bar together.</p>
        </div>

        <section class="card hero">
          <div class="row between"><span class="upper">This week · from ${weekStart}</span><span class="tag lime">${pct}%</span></div>
          <div class="row mt-8" style="align-items:baseline;gap:6px">
            <span style="font-size:40px;font-weight:800">${c.totalMin}</span>
            <span class="muted">/ ${c.goalMin} active min</span>
          </div>
          <div class="bar mt-8" style="height:12px"><div style="width:${pct}%"></div></div>
          <p class="small muted mt-8">Goal = 60 active minutes per member each week.</p>
        </section>

        <div class="grid-3">
          <div class="stat"><div class="v">${c.members}</div><div class="l">members</div></div>
          <div class="stat"><div class="v">${c.activeMembers}</div><div class="l">moved this week</div></div>
          <div class="stat"><div class="v">${c.missions}</div><div class="l">missions</div></div>
        </div>

        <section class="card">
          <h3>Your contribution</h3>
          <div class="row mt-8" style="align-items:baseline;gap:6px">
            <span style="font-size:30px;font-weight:800" class="accent">${c.myMin}</span><span class="muted">active min this week</span>
          </div>
          <p class="small muted mt-8">${c.myMin > 0 ? `That's ${myShare}% of your community's movement this week.` : 'Complete a Move Mission to add your minutes.'}</p>
          <button class="btn primary block mt-16" id="move">Add minutes now</button>
        </section>

        <p class="small muted center">Invite others: they join by entering the same community name.</p>
        <button class="link" id="change" style="color:var(--muted)">Change community</button>
        ${buddySection(buddy)}
        ${institutionLink}
      </div>`;
    el.querySelector('#move').onclick = () => app.navigate('move');
    el.querySelector('#change').onclick = () => drawJoin(c.campus);
    bindBuddy(buddy);
  }

  function drawJoin(existing = '') {
    el.innerHTML = `
      <div class="stack">
        <div>
          <div class="upper">Community Challenge</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:4px">Move together with your community</h1>
          <p class="muted small mt-8">Join your college, class, hostel or club's weekly collective goal. Everyone's active minutes fill one shared bar, with no rankings.</p>
        </div>
        <section class="card">
          <div class="field">
            <label for="campus">Community name</label>
            <input class="input" id="campus" maxlength="80" placeholder="e.g. IIT Delhi, or Hostel 4 Block B" value="${esc(existing)}" />
          </div>
          <p class="tiny muted mt-8">Use the exact same name as your friends so you land on the same team.</p>
          <button class="btn primary block mt-16" id="join">Join community</button>
        </section>
      </div>`;
    el.querySelector('#join').onclick = async () => {
      const name = el.querySelector('#campus').value.trim();
      if (name.length < 2) return toast('Enter your community name', true);
      try {
        const r = await api('/me/context', { method: 'PUT', body: { campus: name } });
        store.user = r.user;
        toast('Joined ' + name);
        await draw();
      } catch (err) { toast(err.message, true); }
    };
  }

  await draw();
}
