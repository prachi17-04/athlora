import { api } from '../api.js';
import { esc, toast } from '../ui.js';

// Collective campus challenge: everyone moves one shared bar. No rankings, no leaderboard.
export async function render(el, app) {
  const { store } = app;

  async function draw() {
    const c = await api('/campus');
    if (!c.campus) return drawJoin();

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
      </div>`;
    el.querySelector('#move').onclick = () => app.navigate('move');
    el.querySelector('#change').onclick = () => drawJoin(c.campus);
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
