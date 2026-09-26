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

module.exports = { fileKV, blobsKV };
