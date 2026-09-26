// Vercel Function running the ATHLORA API. vercel.json rewrites /api/* here;
// Express routes on the original path. Data lives in Upstash Redis.
const { createApp } = require('../server/app');
const { redisFromEnv, missingKV, databaseEnvNames } = require('../server/kv');

function notConnectedMessage() {
  const names = databaseEnvNames();
  if (names.includes('REDIS_URL') || names.some((n) => n.endsWith('_REDIS_URL'))) {
    return 'A Redis database is connected, but it only offers a redis:// URL. ATHLORA needs an Upstash database ' +
      '(it provides KV_REST_API_URL and KV_REST_API_TOKEN). In Vercel: Storage → Create Database → Upstash for Redis, connect it, then redeploy.';
  }
  return 'No database connected. In your Vercel project open Storage → Create Database → Upstash (Redis), ' +
    'connect it to this project, then redeploy.';
}

const kv = redisFromEnv() || missingKV(notConnectedMessage());
const app = createApp(kv);

module.exports = (req, res) => {
  // If the function sees the rewritten URL (/api/index?__path=auth/login), restore /api/auth/login
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original !== null) {
    url.searchParams.delete('__path');
    if (url.pathname === '/api/index' || url.pathname === '/api') {
      url.pathname = '/api/' + original.replace(/^\/+/, '');
    }
    req.url = url.pathname + url.search;
  }
  return app(req, res);
};
