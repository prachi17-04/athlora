// Public certificate page: /verify.html?id=XXXXXXXXXX
// The same page is the printable certificate and the verification result for anyone scanning its QR code.
import { api } from './api.js';
import { esc, toast, fmtDate } from './ui.js';

const root = document.getElementById('root');
const id = (new URLSearchParams(location.search).get('id') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function fail(msg) {
  root.innerHTML = `
    <div class="stack" style="margin-top:10vh;text-align:center">
      <div class="posture-icon" style="color:var(--danger)">✕</div>
      <h1 style="font-size:28px;font-weight:800">Not a valid ATHLORA certificate</h1>
      <p class="muted">${esc(msg)}</p>
      <p class="small muted">Check that the link or QR code wasn't altered.</p>
    </div>`;
}

(async () => {
  if (!id) return fail('No certificate ID in the link.');
  let c;
  try { c = await api(`/certificates/${id}`); } catch (err) { return fail(err.message); }

  const url = `${location.origin}/verify.html?id=${c.id}`;
  document.title = `${c.name} · ATHLORA Verified Fitness Certificate`;
  const measured = (c.fitIndia || []).filter((x) => x.measured);
  root.innerHTML = `
    <div class="cert">
      <div class="cert-head">
        <div class="brand"><img src="/icons/icon.svg" alt="" />ATHLORA</div>
        <span class="verified">✓ Verified certificate</span>
      </div>
      <p class="upper mt-16">Verified Fitness Certificate</p>
      <h1>${esc(c.name)}</h1>
      <p class="muted mt-8">${c.community ? `${esc(c.community)} · ` : ''}Member since ${fmtDate(c.memberSince)} · Issued ${fmtDate(c.issuedAt)}</p>

      <div class="cert-grid">
        <div class="stat"><div class="v">${c.totals.activeMin}</div><div class="l">active minutes</div></div>
        <div class="stat"><div class="v">${c.totals.missions}</div><div class="l">Move Missions</div></div>
        <div class="stat"><div class="v">${c.totals.verifiedMoves}</div><div class="l">camera/sensor-verified moves</div></div>
        <div class="stat"><div class="v">${c.bestStreak}</div><div class="l">best streak (days)</div></div>
        ${c.growth ? `<div class="stat"><div class="v">${c.growth.fgi >= 0 ? '+' : ''}${c.growth.fgi}%</div><div class="l">Fitness Growth Index since ${fmtDate(c.growth.since)}</div></div>` : ''}
        ${c.formAvg14 !== null ? `<div class="stat"><div class="v">${c.formAvg14}/100</div><div class="l">AI exercise form (14 days)</div></div>` : ''}
        ${c.totals.steps ? `<div class="stat"><div class="v">${c.totals.steps.toLocaleString()}</div><div class="l">sensor-verified steps</div></div>` : ''}
        ${c.study?.minutes ? `<div class="stat"><div class="v">${c.study.goodPct ?? '—'}%</div><div class="l">good study posture (${c.study.minutes} min)</div></div>` : ''}
        <div class="stat"><div class="v" style="text-transform:capitalize">${esc(c.fitnessLevel)}</div><div class="l">fitness level · LVL ${c.level}</div></div>
      </div>

      ${measured.length ? `
        <p class="upper mt-16">Fit India Fitness Protocol components</p>
        <div class="stack mt-8" style="gap:10px">
          ${measured.map((x) => `
            <div><div class="row between small"><span>${esc(x.label)}</span><b>${x.score}/100 · ${esc(x.band)}</b></div>
            <div class="bar mt-8"><div style="width:${x.score}%"></div></div></div>`).join('')}
        </div>` : ''}

      <div class="cert-foot">
        <img src="/api/qr?data=${encodeURIComponent(url)}" alt="QR code to verify this certificate" />
        <div class="small muted" style="flex:1;min-width:200px">
          <b style="color:var(--text)">Certificate ID ${esc(c.id)}</b><br/>
          Scan the QR code or open <span style="word-break:break-all">${esc(url)}</span> to verify.<br/>
          Figures are a snapshot at the issue date. Verified moves were confirmed by on-device camera pose detection or phone motion sensors.
          ${c.seatedMode ? ' Completed in seated / adaptive mode.' : ''}
        </div>
      </div>
    </div>
    <div class="actions no-print">
      <button class="btn primary" id="print">Print / Save as PDF</button>
      <button class="btn ghost" id="share">Share link</button>
      <a class="btn ghost" href="/">Open ATHLORA</a>
    </div>`;

  root.querySelector('#print').onclick = () => window.print();
  root.querySelector('#share').onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'My ATHLORA Fitness Certificate', url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
    }
  };
})();
