// XP history: opened by tapping the level / XP tag in the top-right corner.
// Shows where every point came from, down to each exercise in a mission.
import { api } from '../api.js';
import { esc } from '../ui.js';

const KIND = {
  mission: { icon: '🏃', label: 'Move Missions' },
  assessment: { icon: '📷', label: 'AI fitness tests' },
  study: { icon: '📚', label: 'Posture Guardian' },
  class: { icon: '🏫', label: 'Class breaks' },
  other: { icon: '⭐', label: 'Other' },
};
const HOW = { camera: '📷 camera-verified', sensors: '👟 sensor-verified', self: 'done without camera' };

function dayLabel(ts) {
  const d = new Date(ts), today = new Date();
  const key = (x) => x.toDateString();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key(d) === key(today)) return 'Today';
  if (key(d) === key(y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function unitText(it) {
  if (it.unit === 'sec') return `${it.achieved}/${it.target} s`;
  if (it.unit === 'floors') return `${it.achieved}/${it.target} floors`;
  return `${it.achieved}/${it.target} reps`;
}

function details(e) {
  if (!e.items && !e.bonuses.length) return '<p class="tiny muted mt-8">Earned before detailed XP history started, so there is no per-exercise breakdown.</p>';
  const rows = [];
  for (const it of e.items || []) {
    if (e.kind === 'assessment') {
      rows.push(`<div class="xp-line"><span>${esc(it.name)} <span class="tiny muted">· result ${it.result} · ${HOW[it.how] || ''}</span></span><span></span></div>`);
    } else if (it.done === false) {
      rows.push(`<div class="xp-line skipped"><span>${esc(it.name)} <span class="tiny muted">· skipped</span></span><b>0</b></div>`);
    } else {
      rows.push(`<div class="xp-line"><span>${esc(it.name)}<span class="tiny muted"> · ${unitText(it)} · ${HOW[it.how] || ''}${it.form !== null && it.form !== undefined ? ` · form ${it.form}` : ''}</span></span><b class="accent">+${it.xp}</b></div>`);
    }
  }
  for (const b of e.bonuses) rows.push(`<div class="xp-line bonus"><span>✨ ${esc(b.label)}</span><b class="accent">+${b.xp}</b></div>`);
  return `<div class="xp-details mt-8">${rows.join('')}</div>`;
}

export async function render(el, app) {
  const h = await api('/xp-history');
  const groups = [];
  for (const e of h.entries) {
    const label = dayLabel(e.at);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, entries: [], xp: 0 });
    const g = groups[groups.length - 1];
    g.entries.push(e);
    g.xp += e.xp;
  }
  const kinds = Object.entries(h.byKind).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  el.innerHTML = `
    <div class="stack">
      <button class="link" id="back" style="color:var(--muted);justify-self:start">← Back</button>
      <section class="card hero">
        <div class="upper">Your Fitness XP</div>
        <div class="row" style="align-items:baseline;gap:10px;margin-top:6px">
          <span style="font-size:42px;font-weight:800">${h.xp.toLocaleString()}</span><span class="muted">XP · Level ${h.level}</span>
        </div>
        <div class="bar mt-8"><div style="width:${Math.round(h.levelProgress * 100)}%"></div></div>
        <p class="tiny muted mt-8">${(h.nextLevelXp - h.xp).toLocaleString()} XP to level ${h.level + 1}</p>
        ${kinds.length ? `<div class="xp-kinds mt-16">${kinds.map(([k, v]) => `
          <div class="stat"><div class="v" style="font-size:18px">${KIND[k]?.icon || '⭐'} ${v.toLocaleString()}</div><div class="l">${KIND[k]?.label || k}</div></div>`).join('')}</div>` : ''}
      </section>

      <div class="section-title">How you earned it</div>
      ${groups.length ? groups.map((g) => `
        <div class="row between xp-day"><span>${esc(g.label)}</span><span class="accent">+${g.xp.toLocaleString()} XP</span></div>
        <section class="card" style="padding:4px 14px">
          ${g.entries.map((e, i) => `
            <details class="xp-entry">
              <summary>
                <span class="xp-icon">${KIND[e.kind]?.icon || '⭐'}</span>
                <span class="xp-title"><b>${esc(e.title)}</b><span class="tiny muted">${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${e.items?.length && e.kind === 'mission' ? ` · ${e.items.filter((x) => x.done !== false).length} exercise${e.items.filter((x) => x.done !== false).length === 1 ? '' : 's'}` : ''}</span></span>
                <b class="accent">+${e.xp}</b>
              </summary>
              ${details(e)}
            </details>`).join('')}
        </section>`).join('')
      : '<div class="empty">No XP yet. Complete your first Move Mission to start earning!</div>'}
      <p class="tiny muted center">Camera- or sensor-verified exercises earn 1.5× XP, and good form (80+) adds 20% more.</p>
    </div>`;

  el.querySelector('#back').onclick = () => history.length > 1 ? history.back() : app.navigate('dashboard');
}
