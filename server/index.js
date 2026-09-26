// Local server: `npm start` -> http://localhost:3000
require('dotenv').config();
const path = require('path');
const express = require('express');
const { createApp } = require('./app');
const { fileKV, redisFromEnv } = require('./kv');

// Uses Upstash Redis when its env vars are set, otherwise a JSON file in data/
const redis = redisFromEnv();
const kv = redis || fileKV(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const app = createApp(kv);

const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC, { extensions: ['html'] }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`\nATHLORA running at http://localhost:${PORT} (storage: ${redis ? 'Upstash Redis' : 'local file'})`));

process.on('SIGINT', () => { kv.flush?.(); process.exit(0); });
