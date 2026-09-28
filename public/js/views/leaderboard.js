// Leaderboard section: podium for the top 3, top 10 list, your own rank, today's rank movement.
import { api } from '../api.js';
import { esc, toast } from '../ui.js';

const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const MEDALS = ['🥇', '🥈', '🥉'];

function moveBadge(move) {
  if (move === 'new') return '<span class="lb-move new" title="First XP today">NEW</span>';
  if (move > 0) return `<span class="lb-move up" title="Up ${move} today">▲ ${move}</span>`;
  if (move < 0) return `<span class="lb-move down" title="Down ${-move} today">▼ ${-move}</span>`;
  return '<span class="lb-move same" title="No change today">–</span>';
}

function row(r) {
  return `
    <div class="lb-row ${r.me ? 'me' : ''}">
      <span class="lb-rank ${r.rank <= 3 ? 'medal' : ''}">${r.rank <= 3 ? MEDALS[r.rank - 1] : ordinal(r.rank)}</span>
      <span class="lb-name">${esc(r.name)}${r.me ? ' <span class="tag lime">You</span>' : ''}</span>
      <span class="lb-xp">${r.xp.toLocaleString()} XP</span>
      ${moveBadge(r.move)}
    </div>`;
}

// 2nd · 1st · 3rd, with the winner in the middle and tallest
function podium(top) {
  const order = [top[1], top[0], top[2]].map((r, i) => ({ r, place: [2, 1, 3][i] })).filter((x) => x.r);
  return `
    <div class="podium">
      ${order.map(({ r, place }) => `
        <div class="podium-col p${place} ${r.me ? 'me' : ''}">
          <div class="podium-medal">${MEDALS[place - 1]}</div>
          <div class="podium-name">${esc(r.name)}</div>
          <div class="podium-xp">${r.xp.toLocaleString()} XP</div>
          <div class="podium-move">${moveBadge(r.move)}</div>
          <div class="podium-block"><span>${place}</span></div>
        </div>`).join('')}
    </div>`;
}

function body(lb) {
  if (!lb.top.length) return '<div class="empty">No one has earned XP yet. Complete a mission and take 1st place!</div>';
  const rest = lb.top.slice(3);
  const meRow = lb.top.find((r) => r.me) || lb.me;
  // The person directly above me, when they're on the list
  const above = meRow ? lb.top.find((r) => r.rank === meRow.rank - 1) : null;
  let status = 'Earn your first XP to join the leaderboard.';
  if (meRow) {
    status = `You're <b style="color:var(--text)">${ordinal(meRow.rank)}</b> of ${lb.total}. `;
    if (meRow.rank === 1) status += 'Top of the board, keep it up!';
    else if (above) status += `${(above.xp - meRow.xp + 1).toLocaleString()} XP to pass ${esc(above.name)}.`;
    else status += `${(lb.top[lb.top.length - 1].xp - meRow.xp + 1).toLocaleString()} XP to reach the top ${lb.top.length}.`;
  }
  return `
    ${podium(lb.top)}
    ${rest.length ? `<section class="card" style="padding:6px 10px">${rest.map(row).join('')}</section>` : ''}
    ${lb.me ? `<div class="lb-gap">⋯</div><section class="card" style="padding:6px 10px">${row(lb.me)}</section>` : ''}
    <p class="small muted center">${status}</p>`;
}

export async function render(el) {
  let scope = null;
  async function load() {
    const lb = await api(`/leaderboard?limit=10${scope ? `&scope=${scope}` : ''}`);
    scope = lb.scope;
    el.innerHTML = `
      <div class="stack">
        <a class="link" href="#/community" style="color:var(--muted);justify-self:start">← Community</a>
        <div>
          <div class="upper">Leaderboard</div>
          <h1 style="font-size:26px;font-weight:800;margin-top:4px">🏆 Top movers</h1>
          <p class="muted small mt-8">${esc(lb.label)} · ranked by Fitness XP · arrows show today's moves</p>
        </div>
        ${lb.canSwitch ? `<div class="chips" id="lbScope">
          <button type="button" class="chip ${lb.scope === 'community' ? 'on' : ''}" data-scope="community">My community</button>
          <button type="button" class="chip ${lb.scope === 'all' ? 'on' : ''}" data-scope="all">Everyone</button></div>` : ''}
        ${body(lb)}
        <p class="tiny muted center">Names show as first name + last initial. Camera-verified moves earn 1.5× XP.</p>
      </div>`;
    el.querySelector('#lbScope')?.addEventListener('click', async (e) => {
      const chip = e.target.closest('[data-scope]');
      if (!chip || chip.dataset.scope === scope) return;
      scope = chip.dataset.scope;
      try { await load(); } catch (err) { toast(err.message, true); }
    });
  }
  await load();
}
