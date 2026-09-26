// Adapts the Express API to Netlify Functions (v2 format: Web Request in, Web Response out).
const serverless = require('serverless-http');
const { createApp } = require('./app');
const { blobsKV } = require('./kv');

function createNetlifyHandler(getStore) {
  const handle = serverless(createApp(blobsKV(getStore)));

  return async (req) => {
    const url = new URL(req.url);
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const result = await handle({
      httpMethod: req.method,
      path: url.pathname,
      rawUrl: req.url,
      headers: Object.fromEntries(req.headers),
      multiValueHeaders: {},
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: hasBody ? await req.text() : null,
      isBase64Encoded: false,
    }, {});

    const headers = new Headers();
    for (const [k, v] of Object.entries(result.headers || {})) headers.set(k, String(v));
    for (const [k, vs] of Object.entries(result.multiValueHeaders || {})) vs.forEach((v) => headers.append(k, String(v)));
    const body = result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body;
    return new Response(body, { status: result.statusCode, headers });
  };
}

module.exports = { createNetlifyHandler };
