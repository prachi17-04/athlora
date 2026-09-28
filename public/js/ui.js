export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function chips(name, options, selected, { multi = false } = {}) {
  const sel = multi ? new Set(selected) : new Set([selected]);
  return `<div class="chips" data-chips="${name}" data-multi="${multi}">${options.map(([v, label]) =>
    `<button type="button" class="chip ${sel.has(v) ? 'on' : ''}" data-value="${esc(v)}">${esc(label)}</button>`).join('')}</div>`;
}

// Wire up all chip groups inside root. Returns a getter for current values.
export function bindChips(root, onChange) {
  $$('[data-chips]', root).forEach((group) => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      if (group.dataset.multi === 'true') btn.classList.toggle('on');
      else {
        $$('.chip', group).forEach((c) => c.classList.remove('on'));
        btn.classList.add('on');
      }
      onChange?.(group.dataset.chips, chipValue(root, group.dataset.chips));
    });
  });
}

export function chipValue(root, name) {
  const group = $(`[data-chips="${name}"]`, root);
  if (!group) return null;
  const on = $$('.chip.on', group).map((c) => c.dataset.value);
  return group.dataset.multi === 'true' ? on : on[0] ?? null;
}

export function fmtAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtTarget(item) {
  if (item.unit === 'sec') {
    return item.target >= 60 ? `${Math.floor(item.target / 60)} min${item.target % 60 ? ' ' + (item.target % 60) + ' s' : ''}` : `${item.target} sec`;
  }
  if (item.unit === 'floors') return `${item.target} floors`;
  return `${item.target} reps`;
}

export const ENV_OPTIONS = [['room', 'Room'], ['hostel', 'Hostel'], ['classroom', 'Classroom'], ['campus', 'Campus'], ['playground', 'Playground']];
export const EQUIP_OPTIONS = [['chair', 'Chair'], ['stairs', 'Stairs'], ['band', 'Resistance band'], ['dumbbells', 'Dumbbells']];
export const TIME_OPTIONS = [['3', '3 min'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['20', '20 min'], ['30', '30 min'], ['40', '40 min'], ['45', '45 min']];
export const GOAL_OPTIONS = [['general', 'General fitness'], ['strength', 'Strength'], ['endurance', 'Endurance'], ['mobility', 'Mobility']];
export const LEVEL_OPTIONS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];
export const MEDICAL_OPTIONS = ['Knee / joint issues', 'Back pain', 'Asthma', 'Heart condition', 'Recent injury or surgery', 'Other'];
export const SPORT_OPTIONS = ['Cricket', 'Football', 'Basketball', 'Badminton', 'Volleyball', 'Athletics', 'Swimming', 'Tennis', 'Kabaddi', 'Table tennis'];

export const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.2 12 3.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill="currentColor" fill-opacity=".18"/><path d="M4 10.2 12 3.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M7.5 14.5h2.2l1.3-2.5 2 4.5 1.3-2h2.2"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 2.5 4.5 14h6.5l-1 7.5 9-11.5h-6.5z" fill="currentColor" fill-opacity=".28"/><path d="M13.5 2.5 4.5 14h6.5l-1 7.5 9-11.5h-6.5z"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5l1.6 4.4a2 2 0 0 0 1.2 1.2L17.2 10.7l-4.4 1.6a2 2 0 0 0-1.2 1.2L10 17.9l-1.6-4.4a2 2 0 0 0-1.2-1.2L2.8 10.7l4.4-1.6a2 2 0 0 0 1.2-1.2z" fill="currentColor" fill-opacity=".22"/><path d="M10 3.5l1.6 4.4a2 2 0 0 0 1.2 1.2L17.2 10.7l-4.4 1.6a2 2 0 0 0-1.2 1.2L10 17.9l-1.6-4.4a2 2 0 0 0-1.2-1.2L2.8 10.7l4.4-1.6a2 2 0 0 0 1.2-1.2z"/><path d="M18.5 3v4M16.5 5h4M18 16.5v3M16.5 18h3"/></svg>',
  passport: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="currentColor" fill-opacity=".18"/><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10.5" r="2"/><path d="M5.8 16c.6-1.4 1.6-2 2.7-2s2.1.6 2.7 2M14 9.5h4M14 12.5h4M14 15.5h2.5"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor" fill-opacity=".22"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4M17 6h2.5a2.5 2.5 0 0 1-2.5 4M12 14v3.5M8.5 20.5h7M9.5 17.5h5v3h-5z"/></svg>',
  classbreak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3.5" width="18" height="12.5" rx="2" fill="currentColor" fill-opacity=".18"/><rect x="3" y="3.5" width="18" height="12.5" rx="2"/><path d="M12 16v3.5M8 20.5l4-1 4 1"/><path d="m10.3 7.3 4.2 2.45-4.2 2.45z" fill="currentColor" stroke-width="1.4"/></svg>',
  community: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.3" fill="currentColor" fill-opacity=".22"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6z" fill="currentColor" fill-opacity=".22"/><circle cx="9" cy="8" r="3.3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8.5" r="2.5"/><path d="M16.3 13.8c2.7.4 4.7 2.8 4.7 6"/></svg>',
  camera: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
};
