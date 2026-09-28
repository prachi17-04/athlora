// Class Break: its own section for teacher-led class movement breaks.
// Students join with the code on the classroom screen; teachers create a break and open the projector view.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';

const HOSTED_KEY = 'athlora_hosted_breaks';
function hostedBreaks() {
  try { return (JSON.parse(localStorage.getItem(HOSTED_KEY)) || []).filter((b) => Date.now() - b.createdAt < 6 * 3600 * 1000); } catch { return []; }
}
function rememberHosted(b) {
  try { localStorage.setItem(HOSTED_KEY, JSON.stringify([b, ...hostedBreaks()].slice(0, 5))); } catch {}
}

const hostedRow = (b, fresh = false) => `
  <div class="opp ${fresh ? 'now' : ''}">
    <div class="what"><b>Code ${esc(b.code)}</b><span class="tiny muted">${fresh ? 'Ready. Open it on the classroom screen.' : `${b.minutes} min${b.seated ? ' · seated' : ''} · created ${new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span></div>
    <a class="btn sm primary" href="/break.html#${esc(b.code)}.${esc(b.hostKey)}" target="_blank" rel="noopener">Open projector</a>
  </div>`;

export async function render(el, app) {
  const stats = app.store.stats || await app.refreshStats().catch(() => null);
  const joined = stats?.totals?.classBreaks ?? 0;
  const mine = hostedBreaks();

  el.innerHTML = `
    <div class="stack">
      <div>
        <div class="upper">Class Break</div>
        <h1 style="font-size:26px;font-weight:800;margin-top:4px">Move together as a class</h1>
        <p class="muted small mt-8">A 2–5 minute desk-side routine on the classroom screen. Everyone follows along on their phones in sync, earns XP and keeps their streak going.</p>
      </div>

      <section class="card hero">
        <div class="row between"><h2>Join a class break</h2>${joined ? `<span class="tag lime">${joined} joined so far</span>` : ''}</div>
        <p class="small muted mt-8">Scan the QR code on your classroom screen, or type the 5-character code.</p>
        <div class="row mt-16">
          <input class="input" id="breakCode" placeholder="Class code" maxlength="5" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em;font-weight:700" />
          <button class="btn primary" id="joinBreak">Join</button>
        </div>
      </section>

      <section class="card">
        <div class="row between"><h2>Lead a class break</h2><span class="tag">For teachers</span></div>
        <p class="small muted mt-8">Pick a length and style, then open the projector screen. Students join with its QR code and you start everyone together.</p>
        <p class="upper mt-16">Length</p>
        <div class="chips mt-8" id="breakMin">
          ${[2, 3, 5].map((m) => `<button type="button" class="chip ${m === 2 ? 'on' : ''}" data-value="${m}">${m} min</button>`).join('')}
        </div>
        <p class="upper mt-16">Style</p>
        <div class="chips mt-8" id="breakMode">
          <button type="button" class="chip on" data-value="standing">Standing</button>
          <button type="button" class="chip" data-value="seated">Seated</button>
        </div>
        <button class="btn primary block mt-16" id="createBreak">Create class break</button>
        <div id="breakCreated" class="mt-8">${mine.map((b) => hostedRow(b)).join('')}</div>
      </section>

      <section class="card">
        <h3>How it works</h3>
        <div class="steps mt-16">
          <div class="step"><span class="step-n">1</span><div><b>Teacher creates a break</b><p class="small muted">Opens the projector screen showing a QR code and join code.</p></div></div>
          <div class="step"><span class="step-n">2</span><div><b>Students join</b><p class="small muted">Scan the QR or type the code in this Class tab.</p></div></div>
          <div class="step"><span class="step-n">3</span><div><b>Everyone moves in sync</b><p class="small muted">Same move on every screen, 20 seconds each. Finishing earns +15 XP and counts for your streak.</p></div></div>
        </div>
      </section>
    </div>`;

  const pick = (id) => el.querySelector(`#${id} .chip.on`)?.dataset.value;
  for (const id of ['breakMin', 'breakMode']) {
    el.querySelector(`#${id}`).addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (!c) return;
      el.querySelectorAll(`#${id} .chip`).forEach((x) => x.classList.toggle('on', x === c));
    });
  }
  const join = () => {
    const code = el.querySelector('#breakCode').value.trim().toUpperCase();
    if (code.length < 5) return toast('Enter the 5-character class code', true);
    app.navigate(`break/${code}`);
  };
  el.querySelector('#joinBreak').addEventListener('click', join);
  el.querySelector('#breakCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  el.querySelector('#createBreak').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const minutes = Number(pick('breakMin'));
      const seated = pick('breakMode') === 'seated';
      const r = await api('/breaks', { method: 'POST', body: { minutes, seated } });
      const b = { code: r.code, hostKey: r.hostKey, minutes, seated, createdAt: Date.now() };
      rememberHosted(b);
      el.querySelector('#breakCreated').insertAdjacentHTML('afterbegin', hostedRow(b, true));
      toast(`Class break ${r.code} created`);
    } catch (err) { toast(err.message, true); }
    btn.disabled = false;
  });
}
