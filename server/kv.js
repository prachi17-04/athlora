// Key-value storage used by the API.
//   Local (`npm start`): a JSON file in data/
//   Netlify:             Netlify Blobs (built in, no setup needed)
// Each user's missions, activities and assessments live in their own record,
// so two students saving at the same time never overwrite each other.
const fs = require('fs');
const path = require('path');

function fileKV(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'athlora-kv.json');
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  let timer = null;

  function flush() {
    clearTimeout(timer);
    fs.writeFileSync(file + '.tmp', JSON.stringify(data));
    fs.renameSync(file + '.tmp', file);
  }
  const persist = () => { clearTimeout(timer); timer = setTimeout(flush, 50); };

  return {
    async get(key) { return clone(data[key]); },
    async set(key, value) { data[key] = clone(value); persist(); },
    async delete(key) { delete data[key]; persist(); },
    async list(prefix) { return Object.keys(data).filter((k) => k.startsWith(prefix)); },
    flush,
  };
}

// getStore is called per operation so each Netlify invocation uses its own credentials
function blobsKV(getStore) {
  return {
    async get(key) { return (await getStore().get(key, { type: 'json' })) ?? null; },
    async set(key, value) { await getStore().setJSON(key, value); },
    async delete(key) { await getStore().delete(key); },
    async list(prefix) {
      const { blobs } = await getStore().list({ prefix });
      return blobs.map((b) => b.key);
    },
  };
}

// Upstash Redis over its REST API (used on Vercel: Storage -> Upstash for Redis). No extra packages.
function redisKV(url, token) {
  async function cmd(...args) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(`Database error: ${data.error || `HTTP ${res.status}`}`);
    return data.result;
  }
  const globEscape = (s) => s.replace(/[*?[\]\\]/g, '\\$&');
  return {
    async get(key) {
      const v = await cmd('GET', key);
      return v === null || v === undefined ? null : JSON.parse(v);
    },
    async set(key, value) { await cmd('SET', key, JSON.stringify(value)); },
    async delete(key) { await cmd('DEL', key); },
    async list(prefix) {
      const keys = [];
      let cursor = '0';
      do {
        const [next, batch] = await cmd('SCAN', cursor, 'MATCH', `${globEscape(prefix)}*`, 'COUNT', '1000');
        keys.push(...batch);
        cursor = String(next);
      } while (cursor !== '0');
      return keys;
    },
  };
}

// Stand-in used when no database is connected: every call explains how to fix it
function missingKV(message) {
  const fail = async () => { throw new Error(message); };
  return { get: fail, set: fail, delete: fail, list: fail };
}

// Upstash / Vercel KV env var names (the Vercel integration sets KV_REST_API_*)
function redisFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisKV(url, token) : null;
}

module.exports = { fileKV, blobsKV, redisKV, missingKV, redisFromEnv };
