// Netlify Function that runs the ATHLORA API. Data is stored in Netlify Blobs.
const serverless = require('serverless-http');
const { connectLambda, getStore } = require('@netlify/blobs');
const { createApp } = require('../../server/app');
const { blobsKV } = require('../../server/kv');

const app = createApp(blobsKV(() => getStore({ name: 'athlora', consistency: 'strong' })));
const handle = serverless(app);

exports.handler = async (event, context) => {
  connectLambda(event); // gives Netlify Blobs this invocation's credentials
  return handle(event, context);
};
