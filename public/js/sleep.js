import { api } from './api.js';
import { toast } from './ui.js';

// Daily sleep check-in: asked once a day, the first time ATHLORA is opened.
// Today's missions use the answer (short sleep -> lighter, low-impact missions).

const OPTIONS = [
  ['lt4', '😵', 'Under 4 h'], ['4-5', '🥱', '4–5 h'], ['5-6', '😐', '5–6 h'],
  ['6-7', '🙂', '6–7 h'], ['7-8', '😊', '7–8 h'], ['8+', '😴', '8+ h'],
];

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const seenKey = (user) => `athlora_sleep_${user.id}`;
function seenToday(user) {
  try { return localStorage.getItem(seenKey(user)) === localDay(); } catch { return false; }
}
function markSeen(user) {
  try { localStorage.setItem(seenKey(user), localDay()); } catch {}
}

/** Shows the check-in if it hasn't been answered today (on this device for the shared demo profile). */
export function maybeAskSleep(app) {
  const { user, stats } = app.store;
  if (!user || !stats || seenToday(user)) return;
  if (stats.sleep?.asked && !user.demo) { markSeen(user); return; }
  askSleep(app);
}

/** Opens the sleep check-in (also used by "change" on the dashboard). */
export function askSleep(app) {
  const { user } = app.store;
  document.querySelector('.sleep-modal')?.remove();
  const current = app.store.stats?.sleep?.band;
  const wrap = document.createElement('div');
  wrap.className = 'sleep-modal';
  wrap.innerHTML = `
    <div class="sleep-card fade-in" role="dialog" aria-modal="true" aria-labelledby="sleepTitle">
      <div class="sleep-moon">🌙</div>
      <h2 id="sleepTitle">How much did you sleep last night?</h2>
      <p class="small muted mt-8">ATHLORA plans today's missions around your energy. Less sleep means lighter moves.</p>
      <div class="sleep-grid mt-16">
        ${OPTIONS.map(([v, e, l]) => `<button class="sleep-opt ${v === current ? 'on' : ''}" data-band="${v}"><span>${e}</span><b>${l}</b></button>`).join('')}
      </div>
      <button class="link mt-16" id="sleepSkip">Skip for today</button>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();

  async function save(band) {
    markSeen(user);
    wrap.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const r = await api('/me/sleep', { method: 'PUT', body: { band } });
      app.store.stats = r.stats;
      close();
      if (band !== 'skip') {
        const s = r.stats.sleep;
        toast(s.energy === 'low' ? "Got it. Today's missions will be light and gentle 💙"
          : s.energy === 'moderate' ? "Got it. Today's missions will be a bit easier."
            : 'Well rested! Full-power missions today 💪');
      }
      if (/^#\/(dashboard)?$/.test(location.hash) || !location.hash) app.navigate('dashboard');
    } catch (err) {
      close();
      toast(err.message, true);
    }
  }
  wrap.querySelectorAll('[data-band]').forEach((b) => { b.onclick = () => save(b.dataset.band); });
  wrap.querySelector('#sleepSkip').onclick = () => save('skip');
}
