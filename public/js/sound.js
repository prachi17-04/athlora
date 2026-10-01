// Voice + sound cues during exercises.
// Rep exercises: the count is spoken after every correct rep ("one", "two", ...).
// Timed exercises: silent, then a tick each second for the last 5 seconds, then a "ting" when done.
const KEY = 'athlora_sound';
let ctx = null;
let voice = null;

// Remembered across visits when storage is available; the in-memory value covers browsers that block it
let memSetting = null;
export function soundOn() {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return v !== 'off';
  } catch {}
  return memSetting !== false;
}
export function setSound(on) {
  memSetting = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
  if (!on) try { speechSynthesis.cancel(); } catch {}
}

function pickVoice() {
  try {
    const voices = speechSynthesis.getVoices();
    voice = voices.find((v) => /en-IN/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  } catch {}
}
if (typeof speechSynthesis !== 'undefined') {
  pickVoice();
  try { speechSynthesis.onvoiceschanged = pickVoice; } catch {}
}

/** Call from a tap handler: browsers only allow audio and speech after a user gesture. */
export function primeAudio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
  try {
    if (typeof speechSynthesis !== 'undefined' && !speechSynthesis.speaking) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch {}
}

function tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

/** Short clock-like tick (last 5 seconds of a timed exercise). */
export function tick() {
  if (!soundOn()) return;
  tone(1800, 0.05, { type: 'square', vol: 0.05 });
}

/** Bright bell "ting" when an exercise is complete. */
export function ting() {
  if (!soundOn()) return;
  tone(1568, 1.1, { vol: 0.22 });
  tone(2352, 0.7, { vol: 0.08 });
  tone(3136, 0.4, { vol: 0.04 });
}

function speak(text, { rate = 1.15, pitch = 1 } = {}) {
  if (!soundOn() || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel(); // never let counts pile up behind a fast set
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-IN';
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1;
    speechSynthesis.speak(u);
  } catch {}
}

/** Speak the rep count after a correct rep. */
export function sayCount(n) {
  speak(String(n));
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
/** Calls out the rep to do next, long and slow like a coach: "onnne…", then "twooo…" after a correct rep. */
export function cueRep(n) {
  speak(`${WORDS[n] || n}…`, { rate: 0.72, pitch: 1.05 });
}
/** Said when the last rep of the set is done. */
export function sayDone() {
  speak('Done! Great set.', { rate: 1 });
}

/**
 * Ticks once per second during the last 5 seconds of a countdown.
 * Call every frame with the seconds left; returns true while in the final 5.
 */
export function createFinalTicker() {
  let last = null;
  return (secondsLeft) => {
    const s = Math.ceil(secondsLeft);
    if (s <= 5 && s >= 1 && s !== last) { last = s; tick(); return true; }
    return s <= 5;
  };
}
