const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const STRAVO_BASE = 'https://stravo-clfk.onrender.com';
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

// Manifest
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

app.get('/', (req, res) => {
  res.send(`
    <h1>Stravo HD Proxy</h1>
    <p>Stremio addon that filters Stravo streams to 720p+ only, sorted best quality first.</p>
    <p>Install URL: <code>${req.protocol}://${req.get('host')}/manifest.json</code></p>
  `);
});

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

app.listen(PORT, () => {
  console.log(`Stravo HD Proxy running on port ${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
});
