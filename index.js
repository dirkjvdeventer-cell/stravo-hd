const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
app.use(cors());
const STRAVO_BASE = 'https://stravo-clfk.onrender.com';
const LITEAIO_BASE = 'https://liteaio.com';
const LITEAIO_TOKEN = '_6YpxYlFGZcoDhNSY5Sl0HF3';
const PORT = process.env.PORT || 3000;
// Quality priority order — higher index = higher priority
const QUALITY_PRIORITY = {
  '4k': 6,
  '2160p': 6,
  '1080p': 5,
  '1080': 5,
  '720p': 4,
  '720': 4,
  '480p': 3,
  '480': 3,
  '360p': 2,
  '360': 2,
  '240p': 1,
  '240': 1,
};
// Minimum quality to include — set to 720 to block 480p and below
// Change to 480 if you want 480p included
const MIN_QUALITY = 720;
function getQualityScore(stream) {
  const name = ((stream.name || '') + ' ' + (stream.title || '')).toLowerCase();
  for (const [label, score] of Object.entries(QUALITY_PRIORITY).sort((a, b) => b[1] - a[1])) {
    if (name.includes(label)) return score;
  }
  return 0;
}
function getQualityNumber(stream) {
  const name = ((stream.name || '') + ' ' + (stream.title || '')).toLowerCase();
  const match = name.match(/(\d{3,4})p/);
  return match ? parseInt(match[1]) : 0;
}
function filterAndSort(streams) {
  return streams
    .filter(s => {
      const q = getQualityNumber(s);
      // Keep streams with no quality label too (unknown)
      return q === 0 || q >= MIN_QUALITY;
    })
    .sort((a, b) => getQualityScore(b) - getQualityScore(a));
}
// Manifest — Stravo HD
const manifest = {
  id: 'org.ripspaz.stravo.proxy',
  version: '1.0.0',
  name: 'Stravo HD',
  description: 'Stravo streams — 720p and above only, best quality first',
  logo: `${STRAVO_BASE}/static/logo.png`,
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  behaviorHints: {
    configurable: false,
    p2p: false,
  },
};
// Manifest — LiteAIO Proxy
const liteaioManifest = {
  id: 'org.ripspaz.liteaio.proxy',
  version: '1.0.0',
  name: 'LiteAIO Proxy',
  description: 'LiteAIO streams proxied with Stremio user-agent for WuPlay compatibility',
  resources: ['stream', 'catalog', 'meta'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  behaviorHints: {
    configurable: false,
    p2p: false,
  },
};
// Stremio user-agent to bypass LiteAIO block
const STREMIO_UA = 'Mozilla/5.0 (compatible; Stremio/4.4.168)';
app.get('/', (req, res) => {
  res.send(`
    <h1>Stravo HD Proxy</h1>
    <p>Stremio addon that filters Stravo streams to 720p+ only, sorted best quality first.</p>
    <p>Stravo Install URL: <code>${req.protocol}://${req.get('host')}/manifest.json</code></p>
    <hr/>
    <h2>LiteAIO Proxy</h2>
    <p>Proxies LiteAIO with Stremio user-agent — fixes WuPlay 403 errors.</p>
    <p>LiteAIO Install URL: <code>${req.protocol}://${req.get('host')}/liteaio/manifest.json</code></p>
  `);
});
// ─── STRAVO ROUTES ───────────────────────────────────────────────
app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});
app.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  try {
    const url = `${STRAVO_BASE}/default/stream/${type}/${id}.json`;
    console.log(`Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Stremio)',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });
    if (!response.ok) {
      console.error(`Stravo returned ${response.status}`);
      return res.json({ streams: [] });
    }
    const data = await response.json();
    const raw = data.streams || [];
    console.log(`Got ${raw.length} streams from Stravo`);
    const filtered = filterAndSort(raw);
    console.log(`Returning ${filtered.length} streams after filter`);
    res.json({ streams: filtered });
  } catch (err) {
    console.error('Error fetching from Stravo:', err.message);
    res.json({ streams: [] });
  }
});
// ─── LITEAIO PROXY ROUTES ────────────────────────────────────────
app.get('/liteaio/manifest.json', (req, res) => {
  res.json(liteaioManifest);
});
// Generic proxy — forwards any LiteAIO path with Stremio user-agent
app.get('/liteaio/*', async (req, res) => {
  // Strip /liteaio prefix and forward to LiteAIO with token
  const subPath = req.params[0];
  const url = `${LITEAIO_BASE}/${LITEAIO_TOKEN}/${subPath}`;
  console.log(`LiteAIO proxy: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': STREMIO_UA,
        'Accept': 'application/json',
        'Origin': 'https://app.stremio.com',
        'Referer': 'https://app.stremio.com/',
      },
      timeout: 15000,
    });
    if (!response.ok) {
      console.error(`LiteAIO returned ${response.status}`);
      return res.status(response.status).json({ error: `LiteAIO returned ${response.status}` });
    }
    const contentType = response.headers.get('content-type') || 'application/json';
    const body = await response.text();
    res.setHeader('Content-Type', contentType);
    res.send(body);
  } catch (err) {
    console.error('LiteAIO proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
app.listen(PORT, () => {
  console.log(`Stravo HD Proxy running on port ${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
  console.log(`LiteAIO Proxy Manifest: http://localhost:${PORT}/liteaio/manifest.json`);
});
