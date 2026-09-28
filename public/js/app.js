import { api, session } from './api.js';
import { ICONS, esc, toast } from './ui.js';
import { startOnboarding } from './onboarding.js';
import * as dashboard from './views/dashboard.js';
import * as move from './views/move.js';
import * as setup from './views/setup.js';
import * as passport from './views/passport.js';
import * as community from './views/campus.js';
import * as study from './views/study.js';
import * as classBreak from './views/break.js';
import * as classBreakHome from './views/classbreak.js';
import * as xpHistory from './views/xp.js';
import * as leaderboard from './views/leaderboard.js';

const root = document.getElementById('app');

// Shared, in-memory app state. Everything shown comes from the server — no dummy data.
export const store = {
  user: null,
  stats: null,
  missionRequest: null, // { minutes, environment } handed from dashboard to Move
};

const ROUTES = { dashboard, move, setup, passport, community, campus: community, study, break: classBreak, class: classBreakHome, xp: xpHistory, leaders: leaderboard };
const NAV = [
  ['dashboard', 'Dashboard', ICONS.home],
  ['setup', 'AI Setup', ICONS.ai],
  ['move', 'Move', ICONS.move],
  ['passport', 'Passport', ICONS.passport],
  ['leaders', 'Leaders', ICONS.trophy],
  ['community', 'Community', ICONS.community],
  ['class', 'Class', ICONS.classbreak],
];

export const app = {
  store,
  navigate(name) {
    if (location.hash === '#/' + name) route();
    else location.hash = '#/' + name;
  },
  async refreshStats() {
    store.stats = await api('/stats');
    updateLevelTag();
    return store.stats;
  },
  updateLevelTag: () => updateLevelTag(),
  async logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    session.clear();
    store.user = null;
    store.stats = null;
    location.hash = '';
    boot();
  },
};

let cleanup = null;

function mountShell() {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><img src="/icons/icon.svg" alt="" />ATHLORA</div>
        <a class="level-pill" id="lvlTag" href="#/xp" title="See how you earned your XP">
          <span class="level-fill" id="lvlFill"></span>
          <span class="level-text" id="lvlText"></span>
        </a>
      </header>
      <main id="view"></main>
    </div>
    <nav class="bottom-nav" aria-label="Main">
      <div class="inner">
        ${NAV.map(([key, label, icon]) => `
          <a href="#/${key}" data-nav="${key}" class="${key === 'move' ? 'move-tab' : ''}" aria-label="${label}">
            <span class="nav-pill">${icon}</span><span class="nav-label">${label}</span>
          </a>`).join('')}
      </div>
    </nav>`;
}

// Top-right level pill: fills up as you get closer to the next level
export function updateLevelTag() {
  const el = document.getElementById('lvlTag');
  const s = store.stats;
  if (!el || !s) return;
  const pct = Math.max(0, Math.min(1, s.levelProgress)) * 100;
  const left = Math.max(0, s.nextLevelXp - s.xp);
  el.querySelector('#lvlFill').style.width = `${pct}%`;
  el.querySelector('#lvlText').innerHTML = `<b>LVL ${s.level}</b> · ${left.toLocaleString()} XP to go ›`;
  el.classList.toggle('almost', pct >= 80);
  el.setAttribute('aria-label', `Level ${s.level}, ${s.xp} XP. ${left} XP to level ${s.level + 1}. Tap to see your XP history.`);
}

async function route() {
  if (!document.getElementById('view')) return;
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  // Routes can carry one parameter, e.g. #/break/AB3CD
  const [base, param] = (path || '').split('/');
  const name = base || 'dashboard';
  store.routeParam = param || null;
  // Mission links from opportunity reminders: #/move?min=12&env=campus
  if (name === 'move' && query) {
    const q = new URLSearchParams(query);
    const min = Number(q.get('min'));
    if (min > 0) store.missionRequest = { minutes: min, environment: q.get('env') || undefined };
    history.replaceState(null, '', '#/move');
  }
  const view = ROUTES[name] || dashboard;
  const navKey = { campus: 'community', break: 'class', study: 'dashboard' }[name] || (ROUTES[name] ? name : 'dashboard');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const el = document.getElementById('view');
  el.innerHTML = '<div class="spinner"></div>';
  window.scrollTo(0, 0);
  try {
    cleanup = await view.render(el, app);
    el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in');
    updateLevelTag();
  } catch (err) {
    el.innerHTML = `<div class="empty">${esc(err.message)}<br/><br/><button class="btn sm" id="retry">Retry</button></div>`;
    el.querySelector('#retry').onclick = route;
  }
}

async function enterApp(user) {
  store.user = user;
  mountShell();
  try { await app.refreshStats(); } catch (e) { toast(e.message, true); }
  if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/dashboard';
  else route();
}

async function boot() {
  if (!session.token) {
    startOnboarding(root, { onDone: enterApp });
    return;
  }
  root.innerHTML = '<div class="spinner" style="margin-top:40vh"></div>';
  try {
    const { user } = await api('/me');
    if (!user.onboarded) {
      startOnboarding(root, { user, onDone: enterApp });
      return;
    }
    await enterApp(user);
  } catch (err) {
    root.innerHTML = `<div class="onb splash"><p class="muted">${esc(err.message)}</p><button class="btn primary mt-16" id="retry">Try again</button></div>`;
    root.querySelector('#retry').onclick = boot;
  }
}

// route() is a no-op until the app shell is mounted, so it is safe to listen from the start
window.addEventListener('hashchange', route);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

boot();
