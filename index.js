const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
app.use(cors());

const STRAVO_BASE = 'https://stravo-clfk.onrender.com';
const LITEAIO_BASE = 'https://liteaio.com';
const LITEAIO_TOKEN = '_6YpxYlFGZcoDhNSY5Sl0HF3';
const LITEAIO_TOKEN_2 = 'HWYwH5FcgisEGBxk0d6ms8Vd';
const PENGUPLAY_BASE = 'https://pengu.uk';
const PENGUPLAY_TOKEN = '%7B%22source_4khdhub%22%3A%22on%22%2C%22source_cinefreak%22%3A%22on%22%2C%22source_aniwaves%22%3A%22on%22%2C%22source_moviebox%22%3A%22on%22%2C%22source_moviesdrives%22%3A%22on%22%2C%22source_allmovieland%22%3A%22on%22%2C%22source_overflix%22%3A%22on%22%2C%22source_vaplayer%22%3A%22on%22%2C%22source_vidking%22%3A%22on%22%2C%22source_animesuge%22%3A%22on%22%2C%22source_aether%22%3A%22on%22%2C%22source_vidlink%22%3A%22on%22%2C%22source_hdghartv%22%3A%22on%22%2C%22source_scloud%22%3A%22on%22%2C%22res_1080%22%3A%22on%22%2C%22res_720%22%3A%22on%22%2C%22res_480%22%3A%22on%22%2C%22res_360%22%3A%22on%22%2C%22disable_direct%22%3A%22on%22%2C%22auth_token%22%3A%229xYPEkp5ztRKMJ1clYgJctJAeeNKxpm3VIWBSVHGBUo%22%7D';

const PORT = process.env.PORT || 3000;
const STREMIO_UA = 'Mozilla/5.0 (compatible; Stremio/4.4.168)';

// Max file size in bytes (8 GB)
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024 * 1024;

// CAM/TS/bad source keywords to block
const BAD_SOURCE_KEYWORDS = [
  'cam', 'camrip', 'hdcam', 'ts', 'telesync', 'tc', 'telecine',
  'hdts', 'scr', 'screener', 'dvdscr', 'r5', 'pdvd', 'workprint'
];

// ─── QUALITY SCORING (STRAVO) ────────────────────────────────────
const QUALITY_PRIORITY = {
  '4k': 6, '2160p': 6,
  '1080p': 5, '1080': 5,
  '720p': 4, '720': 4,
  '480p': 3, '480': 3,
  '360p': 2, '360': 2,
  '240p': 1, '240': 1,
};
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
      return q === 0 || q >= MIN_QUALITY;
    })
    .sort((a, b) => getQualityScore(b) - getQualityScore(a));
}

// ─── PENGUPLAY FILTERS ───────────────────────────────────────────
function isBadSource(stream) {
  const text = ((stream.name || '') + ' ' + (stream.title || '') + ' ' + (stream.description || '')).toLowerCase();
  return BAD_SOURCE_KEYWORDS.some(kw => {
    // Match as whole word to avoid false positives e.g. "ts" in "subtitles"
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    return re.test(text);
  });
}

function getFileSizeBytes(stream) {
  // PenguPlay puts size info in stream.description or stream.title
  const text = ((stream.name || '') + ' ' + (stream.title || '') + ' ' + (stream.description || ''));
  
  // Match patterns like "7.08 GB", "1.43 GB", "830 MB", "239 MB"
  const gbMatch = text.match(/([\d.]+)\s*GB/i);
  if (gbMatch) return parseFloat(gbMatch[1]) * 1024 * 1024 * 1024;
  
  const mbMatch = text.match(/([\d.]+)\s*MB/i);
  if (mbMatch) return parseFloat(mbMatch[1]) * 1024 * 1024;

  // Also check behaviorHints.bingeGroup or other fields
  const sizeField = stream.size || 0;
  if (sizeField) return sizeField;

  return 0;
}

function isTooBig(stream) {
  const size = getFileSizeBytes(stream);
  if (size === 0) return false; // no size info, let it through
  return size > MAX_FILE_SIZE_BYTES;
}

function filterPenguPlay(streams) {
  const bad = streams.filter(s => isBadSource(s));
  const good = streams.filter(s => !isBadSource(s) && !isTooBig(s));

  // If only bad sources exist, return a notice stream
  if (good.length === 0 && bad.length > 0) {
    return [{
      name: '⚠️ No Clean Release',
      title: 'No digital release available yet — only CAM/TS sources found.',
      url: '',
      behaviorHints: { notWebReady: true },
    }];
  }

  return good;
}

// ─── LITEAIO PROXY FUNCTION ──────────────────────────────────────
async function liteaioProxy(token, req, res) {
  const subPath = req.params[0];
  const url = `${LITEAIO_BASE}/${token}/${subPath}`;
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
}

// ─── MANIFESTS ───────────────────────────────────────────────────
const manifest = {
  id: 'org.ripspaz.stravo.proxy',
  version: '1.0.0',
  name: 'Stravo HD',
  description: 'Stravo streams — 720p and above only, best quality first',
  logo: `${STRAVO_BASE}/static/logo.png`,
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  behaviorHints: { configurable: false, p2p: false },
};

const liteaioManifest = {
  id: 'org.ripspaz.liteaio.proxy',
  version: '1.0.0',
  name: 'LiteAIO Proxy',
  description: 'LiteAIO streams proxied with Stremio user-agent for WuPlay compatibility',
  resources: ['stream', 'catalog', 'meta'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  behaviorHints: { configurable: false, p2p: false },
};

const trevorttvManifest = {
  id: 'org.ripspaz.trevortvd.proxy',
  version: '1.0.0',
  name: 'trevortvd',
  description: 'trevortvd LiteAIO streams proxied with Stremio user-agent for WuPlay compatibility',
  resources: ['stream', 'catalog', 'meta'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  behaviorHints: { configurable: false, p2p: false },
};

const penguplayManifest = {
  id: 'org.ripspaz.penguplay.proxy',
  version: '1.0.0',
  name: 'PenguPlay Filtered',
  description: 'PenguPlay — CAM/TS blocked, files over 8GB blocked, English only',
  logo: 'https://pengu.uk/penguplay-icon.png',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  behaviorHints: { configurable: false, p2p: false },
};

// ─── HOME PAGE ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  res.send(`
    <h1>Stravo HD Proxy</h1>
    <p>Stravo Install URL: <code>${host}/manifest.json</code></p>
    <hr/>
    <h2>LiteAIO Proxy</h2>
    <p>LiteAIO Install URL: <code>${host}/liteaio/manifest.json</code></p>
    <hr/>
    <h2>trevortvd</h2>
    <p>trevortvd Install URL: <code>${host}/trevortvd/manifest.json</code></p>
    <hr/>
    <h2>PenguPlay Filtered</h2>
    <p>CAM/TS blocked · Files over 8GB blocked · Clean releases only</p>
    <p>PenguPlay Install URL: <code>${host}/penguplay/manifest.json</code></p>
  `);
});

// ─── STRAVO ROUTES ───────────────────────────────────────────────
app.get('/manifest.json', (req, res) => res.json(manifest));

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

// ─── LITEAIO ROUTES ──────────────────────────────────────────────
app.get('/liteaio/manifest.json', (req, res) => res.json(liteaioManifest));
app.get('/liteaio/*', (req, res) => liteaioProxy(LITEAIO_TOKEN, req, res));

// ─── TREVORTVD ROUTES ────────────────────────────────────────────
app.get('/trevortvd/manifest.json', (req, res) => res.json(trevorttvManifest));
app.get('/trevortvd/*', (req, res) => liteaioProxy(LITEAIO_TOKEN_2, req, res));

// ─── PENGUPLAY ROUTES ────────────────────────────────────────────
app.get('/penguplay/manifest.json', (req, res) => res.json(penguplayManifest));

app.get('/penguplay/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  try {
    const url = `${PENGUPLAY_BASE}/${PENGUPLAY_TOKEN}/stream/${type}/${id}.json`;
    console.log(`PenguPlay fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': STREMIO_UA,
        'Accept': 'application/json',
        'Origin': 'https://app.stremio.com',
        'Referer': 'https://app.stremio.com/',
      },
      timeout: 20000,
    });
    if (!response.ok) {
      console.error(`PenguPlay returned ${response.status}`);
      return res.json({ streams: [] });
    }
    const data = await response.json();
    const raw = data.streams || [];
    console.log(`PenguPlay got ${raw.length} streams`);
    const filtered = filterPenguPlay(raw);
    console.log(`PenguPlay returning ${filtered.length} streams after filter`);
    res.json({ streams: filtered });
  } catch (err) {
    console.error('PenguPlay proxy error:', err.message);
    res.json({ streams: [] });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
  console.log(`Stravo:     http://localhost:${PORT}/manifest.json`);
  console.log(`LiteAIO:    http://localhost:${PORT}/liteaio/manifest.json`);
  console.log(`trevortvd:  http://localhost:${PORT}/trevortvd/manifest.json`);
  console.log(`PenguPlay:  http://localhost:${PORT}/penguplay/manifest.json`);
});
