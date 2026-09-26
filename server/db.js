// Tiny JSON-file database. Good for a pilot with a few hundred students.
// Swap for Postgres/MongoDB later without touching the routes' logic.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'athlora.json');

const EMPTY = { users: [], sessions: [], otps: [], missions: [], activities: [], assessments: [] };

let state;

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    state = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } else {
    state = structuredClone(EMPTY);
    save();
  }
}

let saveTimer = null;
function save() {
  // Debounced atomic write: write to a temp file, then rename over the real one.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}

function flushSync() {
  clearTimeout(saveTimer);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

load();

module.exports = {
  get data() { return state; },
  save,
  flushSync,
};
