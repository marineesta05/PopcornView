try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch (e) { }
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

try {
  if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
  }
} catch (e) {
  console.warn('Warning: `node-fetch` is not available. Run `npm install` inside backend to install dependencies.');
}

const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors());
app.use(express.json());
app.use(cors());


app.get('/api/films', async (req, res) => {
  try {
    const dataPath = path.join(__dirname, 'data', 'films.json');
    let json = [];
    try {
      const text = await fs.readFile(dataPath, 'utf8');
      json = JSON.parse(text || '[]');
    } catch (err) {
      json = [];
    }
    res.json(json);
  } catch (err) {
    console.error('read films error', err);
    res.status(500).json({ error: String(err) });
  }
});

const DATA_PATH = path.join(__dirname, 'data', 'films.json');

async function readStoredFilms() {
  try {
    const txt = await fs.readFile(DATA_PATH, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (e) {
    return [];
  }
}

async function writeStoredFilms(arr) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(arr, null, 2), 'utf8');
}

app.post('/api/films', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.id) return res.status(400).json({ error: 'Invalid payload, must include id' });
    const films = await readStoredFilms();
    const exists = films.find(f => String(f.id) === String(payload.id) || String(f._id) === String(payload._id));
    if (exists) return res.status(409).json({ error: 'Film already exists' });
    const item = Object.assign({}, payload);
    if (!item._id) item._id = String(item.id || Date.now());
    films.unshift(item);
    await writeStoredFilms(films);
    res.status(201).json(item);
  } catch (err) {
    console.error('post films error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.put('/api/films/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const payload = req.body;
    const films = await readStoredFilms();
    const idx = films.findIndex(f => String(f._id) === id || String(f.id) === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    films[idx] = Object.assign({}, films[idx], payload);
    await writeStoredFilms(films);
    res.json(films[idx]);
  } catch (err) {
    console.error('put films error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/api/films/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const films = await readStoredFilms();
    const newFilms = films.filter(f => !(String(f._id) === id || String(f.id) === id));
    if (newFilms.length === films.length) return res.status(404).json({ error: 'Not found' });
    await writeStoredFilms(newFilms);
    res.json({ ok: true });
  } catch (err) {
    console.error('delete films error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/sync-tmdb', async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY || req.body.apiKey;
    if (!apiKey) return res.status(400).json({ error: 'TMDB API key required' });

    const movies = [];
    const perPage = 20; 
    const pagesNeeded = 10; 

    for (let page = 1; page <= pagesNeeded; page++) {
      const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&page=${page}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`TMDB request failed: ${resp.status}`);
      const data = await resp.json();
      if (Array.isArray(data.results)) {
        for (const m of data.results) {
          movies.push({
            _id: String(m.id),
            id: m.id,
            title: m.title,
            overview: m.overview,
            poster_path: m.poster_path,
            release_date: m.release_date,
            vote_average: m.vote_average
          });
        }
      }
    }

    res.json({ count: movies.length, results: movies.slice(0, 200) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/tmdb/popular', async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'TMDB_API_KEY not configured on server' });
    const page = Number(req.query.page || 1);
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&page=${page}`;
    const resp = await fetch(url);
    if (!resp.ok) return res.status(resp.status).json({ error: 'TMDB request failed' });
    const data = await resp.json();
    const results = (data.results || []).map(m => ({ id: m.id, title: m.title, overview: m.overview, poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average }));
    res.json({ page: data.page, total_pages: data.total_pages, results });
  } catch (err) {
    console.error('tmdb popular error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/tmdb/search', async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'TMDB_API_KEY not configured on server' });
    const q = String(req.query.q || req.query.query || '').trim();
    if (!q) return res.status(400).json({ error: 'query parameter required (q or query)' });
    const page = Number(req.query.page || 1);
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=en-US&page=${page}&query=${encodeURIComponent(q)}`;
    const resp = await fetch(url);
    if (!resp.ok) return res.status(resp.status).json({ error: 'TMDB request failed' });
    const data = await resp.json();
    const results = (data.results || []).map(m => ({ id: m.id, title: m.title, overview: m.overview, poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average }));
    res.json({ page: data.page, total_pages: data.total_pages, results });
  } catch (err) {
    console.error('tmdb search error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.get('/', (req, res) => {
  res.send('PopcornView backend (TMDB-proxy)');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tmdb_key_present: !!process.env.TMDB_API_KEY });
});

app.listen(PORT, () => {
  console.log(`Backend (TMDB-proxy mode) listening on http://localhost:${PORT}`);
});
