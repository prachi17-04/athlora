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
export const TIME_OPTIONS = [['3', '3 min'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['20', '20 min']];
export const GOAL_OPTIONS = [['general', 'General fitness'], ['strength', 'Strength'], ['endurance', 'Endurance'], ['mobility', 'Mobility']];
export const LEVEL_OPTIONS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];
export const MEDICAL_OPTIONS = ['Knee / joint issues', 'Back pain', 'Asthma', 'Heart condition', 'Recent injury or surgery', 'Other'];
export const SPORT_OPTIONS = ['Cricket', 'Football', 'Basketball', 'Badminton', 'Volleyball', 'Athletics', 'Swimming', 'Tennis', 'Kabaddi', 'Table tennis'];

export const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v5m0 0-4 4m4-4 4 4M7 21l1-5m9 5-1-5M5 10h14"/></svg>',
  passport: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/></svg>',
  campus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/></svg>',
  camera: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
};
