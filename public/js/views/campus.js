import { api } from '../api.js';
import { esc, toast } from '../ui.js';

// Move buddy: two friends share one streak. Social motivation without any comparison.
function buddySection(b) {
  if (b?.buddy) {
    const x = b.buddy;
    return `
      <div class="section-title">Move buddy</div>
      <section class="card">
        <div class="row between"><h2>${esc(x.name)}</h2><span class="tag ${x.sharedStreak ? 'lime' : ''}">${x.sharedStreak} day shared streak</span></div>
        <div class="grid-2 mt-16">
          <div class="stat"><div class="v" style="font-size:18px">${x.meMovedToday ? '✓ Done' : 'Not yet'}</div><div class="l">You today</div></div>
          <div class="stat"><div class="v" style="font-size:18px">${x.movedToday ? '✓ Done' : 'Not yet'}</div><div class="l">${esc(x.name)} today</div></div>
        </div>
        <p class="small muted mt-16">The streak grows only on days you <b>both</b> complete a mission. The one who moves second each day gets +10 XP.</p>
        <button class="link mt-16" id="unbuddy" style="color:var(--muted)">Remove buddy</button>
        <div id="unbuddyConfirm" hidden class="row mt-8">
          <span class="small">End the buddy link?</span>
          <button class="btn sm danger" id="unbuddyYes">Yes, remove</button>
          <button class="btn sm ghost" id="unbuddyNo">Keep</button>
        </div>
      </section>`;
  }
  return `
    <div class="section-title">Move buddy</div>
    <section class="card">
      <h2>Move with a friend</h2>
      <p class="muted small mt-8">Pair up with one friend. You share a streak that grows only on days you both move. There's no scoreboard and no comparison, just someone counting on you.</p>
      <div id="codeArea" class="mt-16">
        ${b?.code ? `<div class="code-box">${esc(b.code)}</div><p class="tiny muted center mt-8">Share this code with your friend. It's valid for 24 hours.</p>`
          : '<button class="btn ghost block" id="getCode">Get my buddy code</button>'}
      </div>
      <div class="row mt-16">
        <input class="input sm" id="joinCode" placeholder="Friend's code" maxlength="6" style="text-transform:uppercase" />
        <button class="btn sm" id="joinBuddy">Join</button>
      </div>
    </section>`;
}

// Collective campus challenge: everyone moves one shared bar. No rankings, no leaderboard.
export async function render(el, app) {
  const { store } = app;

  function bindBuddy() {
    el.querySelector('#getCode')?.addEventListener('click', async () => {
      try {
        const r = await api('/buddy/code', { method: 'POST' });
        el.querySelector('#codeArea').innerHTML = `<div class="code-box">${esc(r.code)}</div><p class="tiny muted center mt-8">Share this code with your friend. It's valid for 24 hours.</p>`;
      } catch (err) { toast(err.message, true); }
    });
    el.querySelector('#joinBuddy')?.addEventListener('click', async () => {
      const code = el.querySelector('#joinCode').value.trim();
      if (code.length < 6) return toast("Enter your friend's 6-character code", true);
      try {
        await api('/buddy/join', { method: 'POST', body: { code } });
        toast("You're now move buddies!");
        await draw();
      } catch (err) { toast(err.message, true); }
    });
    el.querySelector('#unbuddy')?.addEventListener('click', () => { el.querySelector('#unbuddyConfirm').hidden = false; });
    el.querySelector('#unbuddyNo')?.addEventListener('click', () => { el.querySelector('#unbuddyConfirm').hidden = true; });
    el.querySelector('#unbuddyYes')?.addEventListener('click', async () => {
      try { await api('/buddy', { method: 'DELETE' }); toast('Buddy removed'); await draw(); } catch (err) { toast(err.message, true); }
    });
  }

  const institutionLink = `
    <a class="card" href="/institution.html" style="display:block;text-decoration:none;color:inherit">
      <div class="row between"><div><div class="upper">For PE departments</div><b>Institution dashboard →</b></div></div>
      <p class="tiny muted mt-8">Anonymous campus-wide insights: activity trends, when students move, Fit India component averages. No names, ever.</p>
    </a>`;

  async function draw() {
    const [c, buddy] = await Promise.all([api('/campus'), api('/buddy').catch(() => null)]);
    if (!c.campus) {
      drawJoin();
      el.querySelector('.stack').insertAdjacentHTML('beforeend', buddySection(buddy) + institutionLink);
      bindBuddy();
      return;
    }

    const pct = Math.min(100, Math.round((c.totalMin / c.goalMin) * 100));
    const myShare = c.totalMin > 0 ? Math.round((c.myMin / c.totalMin) * 100) : 0;
    const weekStart = new Date(c.weekStart + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    el.innerHTML = `
      <div class="stack">
        <div>
          <div class="upper">Campus Challenge</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:4px">${esc(c.campus)}</h1>
          <p class="muted small mt-8">One shared goal. No rankings — every student who moves pushes the bar together.</p>
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
          <p class="small muted mt-8">${c.myMin > 0 ? `That's ${myShare}% of your campus's movement this week.` : 'Complete a Move Mission to add your minutes.'}</p>
          <button class="btn primary block mt-16" id="move">Add minutes now</button>
        </section>

        <p class="small muted center">Invite classmates: they join by entering the same campus name.</p>
        <button class="link" id="change" style="color:var(--muted)">Change campus</button>
        ${buddySection(buddy)}
        ${institutionLink}
      </div>`;
    el.querySelector('#move').onclick = () => app.navigate('move');
    el.querySelector('#change').onclick = () => drawJoin(c.campus);
    bindBuddy();
  }

  function drawJoin(existing = '') {
    el.innerHTML = `
      <div class="stack">
        <div>
          <div class="upper">Campus Challenge</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:4px">Move together with your campus</h1>
          <p class="muted small mt-8">Join your college's weekly collective goal. Everyone's active minutes fill one shared bar — no rankings.</p>
        </div>
        <section class="card">
          <div class="field">
            <label for="campus">College / campus name</label>
            <input class="input" id="campus" maxlength="80" placeholder="e.g. IIT Delhi" value="${esc(existing)}" />
          </div>
          <p class="tiny muted mt-8">Use the exact same name as your classmates so you land on the same team.</p>
          <button class="btn primary block mt-16" id="join">Join campus</button>
        </section>
      </div>`;
    el.querySelector('#join').onclick = async () => {
      const name = el.querySelector('#campus').value.trim();
      if (name.length < 2) return toast('Enter your campus name', true);
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
