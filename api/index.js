// Vercel Function running the ATHLORA API. vercel.json rewrites /api/* here;
// Express routes on the original path. Data lives in Upstash Redis.
const { createApp } = require('../server/app');
const { redisFromEnv, missingKV } = require('../server/kv');

const kv = redisFromEnv() || missingKV(
  'No database connected. In your Vercel project open Storage → Create Database → Upstash (Redis), ' +
  'connect it to this project, then redeploy.'
);
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
