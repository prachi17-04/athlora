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

// Any Redis reachable by a redis:// or rediss:// URL (e.g. Vercel's "Redis" integration, which sets REDIS_URL).
// One client per server instance, connected on first use and reused across requests.
function tcpRedisKV(url) {
  let clientPromise = null;
  function client() {
    if (!clientPromise) {
      const { createClient } = require('redis');
      const c = createClient({
        url,
        RESP: 2, // classic protocol: supported by every Redis server and provider
        socket: {
          connectTimeout: 10000,
          // Give up after a few attempts so a request fails with a clear error instead of hanging
          reconnectStrategy: (retries) => (retries > 3 ? new Error('Redis is unreachable') : Math.min(retries * 200, 1000)),
        },
      });
      c.on('error', (err) => console.error('Redis error:', err.message));
      clientPromise = c.connect().then(() => c).catch((err) => {
        clientPromise = null;
        throw new Error(`Database error: could not connect to Redis (${err.message})`);
      });
    }
    return clientPromise;
  }
  const globEscape = (s) => s.replace(/[*?[\]\\]/g, '\\$&');
  return {
    async get(key) {
      const v = await (await client()).get(key);
      return v === null || v === undefined ? null : JSON.parse(v);
    },
    async set(key, value) { await (await client()).set(key, JSON.stringify(value)); },
    async delete(key) { await (await client()).del(key); },
    async list(prefix) {
      const c = await client();
      const keys = [];
      let cursor = '0';
      do {
        const r = await c.scan(cursor, { MATCH: `${globEscape(prefix)}*`, COUNT: 1000 });
        keys.push(...r.keys);
        cursor = String(r.cursor);
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

// Finds Upstash REST credentials in the environment. Vercel's integration uses KV_REST_API_URL/TOKEN,
// Upstash's own uses UPSTASH_REDIS_REST_URL/TOKEN, and either may carry a custom prefix (e.g. STORAGE_KV_REST_API_URL).
function findRedisEnv(env = process.env) {
  const pairs = [['KV_REST_API_URL', 'KV_REST_API_TOKEN'], ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'], ['REDIS_REST_URL', 'REDIS_REST_TOKEN']];
  for (const [urlSuffix, tokenSuffix] of pairs) {
    const urlKeys = Object.keys(env).filter((k) => k.endsWith(urlSuffix) && env[k]).sort((a, b) => a.length - b.length);
    for (const urlKey of urlKeys) {
      const tokenKey = urlKey.slice(0, -urlSuffix.length) + tokenSuffix;
      if (env[tokenKey]) return { url: env[urlKey], token: env[tokenKey], urlKey, tokenKey };
    }
  }
  return null;
}

// Prefers Upstash's REST API; otherwise any redis:// URL (REDIS_URL, possibly with a custom prefix)
function redisFromEnv(env = process.env) {
  const found = findRedisEnv(env);
  if (found) return redisKV(found.url, found.token);
  const urlKey = Object.keys(env)
    .filter((k) => (k === 'REDIS_URL' || k.endsWith('_REDIS_URL')) && /^rediss?:\/\//.test(env[k] || ''))
    .sort((a, b) => a.length - b.length)[0];
  return urlKey ? tcpRedisKV(env[urlKey]) : null;
}

// Names (never values) of database-looking env vars, to diagnose "not connected"
function databaseEnvNames(env = process.env) {
  return Object.keys(env).filter((k) => /KV_|REDIS|UPSTASH/i.test(k)).sort();
}

module.exports = { fileKV, blobsKV, redisKV, tcpRedisKV, missingKV, redisFromEnv, findRedisEnv, databaseEnvNames };
