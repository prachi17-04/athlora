// Shared timing for class movement breaks. The projector and every student phone compute the
// current move from the same server start time, so they stay in sync without a live connection.

// Offset between the server clock and this device, from a response's serverNow
export function clockOffset(view, requestStartedAt) {
  const rtt = Date.now() - requestStartedAt;
  return view.serverNow + rtt / 2 - Date.now();
}

export function breakPhase(b, offset = 0) {
  if (b.status === 'expired') return { phase: 'expired' };
  if (b.status === 'ended' && !b.startedAt) return { phase: 'done' };
  if (!b.startedAt) return { phase: 'lobby' };
  const now = Date.now() + offset;
  if (now < b.startedAt) return { phase: 'countdown', secLeft: Math.ceil((b.startedAt - now) / 1000) };
  if (b.status === 'ended') return { phase: 'done' };
  let t = (now - b.startedAt) / 1000;
  const total = b.moves.reduce((s, m) => s + m.sec, 0);
  const elapsed = t;
  for (let i = 0; i < b.moves.length; i++) {
    const m = b.moves[i];
    if (t < m.sec) {
      return { phase: 'move', index: i, move: m, next: b.moves[i + 1] || null, secLeft: Math.ceil(m.sec - t), progress: elapsed / total };
    }
    t -= m.sec;
  }
  return { phase: 'done' };
}

export const joinUrl = (code) => `${location.origin}/#/break/${code}`;
