try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch (e) { }
const express = require('express');
const path = require('path');
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
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'TMDB_API_KEY not configured on server. Create a `backend/.env` with TMDB_API_KEY=your_key and restart the server.' });

    const q = String(req.query.q || '').trim();
    const page = Number(req.query.page || 1);

    let url;
    if (q) {
      url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=en-US&page=${page}&query=${encodeURIComponent(q)}`;
    } else {
      url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&page=${page}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) return res.status(resp.status).json({ error: 'TMDB request failed' });
    const data = await resp.json();
    const results = (data.results || []).map(m => ({ id: m.id, title: m.title, overview: m.overview, poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average }));
    res.json({ page: data.page, total_pages: data.total_pages, results });
  } catch (err) {
    console.error('proxy /api/films error', err);
    res.status(500).json({ error: String(err) });
  }
});

function persistenceDisabled(req, res) {
  res.status(405).json({ error: 'Persistence disabled: this server proxies TMDB only. Use TMDB browser to view/add items (no local storage).' });
}

app.post('/api/films', persistenceDisabled);
app.put('/api/films/:id', persistenceDisabled);
app.delete('/api/films/:id', persistenceDisabled);

app.post('/api/sync-tmdb', async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY || req.body.apiKey;
    if (!apiKey) return res.status(400).json({ error: 'TMDB API key required. Set TMDB_API_KEY in backend/.env or pass { apiKey } in the request body' });

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
    if (!apiKey) return res.status(400).json({ error: 'TMDB_API_KEY not configured on server. Create `backend/.env` with TMDB_API_KEY and restart.' });
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
    if (!apiKey) return res.status(400).json({ error: 'TMDB_API_KEY not configured on server. Create `backend/.env` with TMDB_API_KEY and restart.' });
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
  res.send('PopcornView backend (TMDB-proxy). Use /api/health or /api/films');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tmdb_key_present: !!process.env.TMDB_API_KEY });
});

app.listen(PORT, () => {
  console.log(`Backend (TMDB-proxy mode) listening on http://localhost:${PORT}`);
});
