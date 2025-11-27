const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const DATA_PATH = path.join(__dirname, 'data', 'films.json');

app.use(cors());
app.use(express.json());

async function readFilms() {
  try {
    const txt = await fs.readFile(DATA_PATH, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeFilms(arr) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(arr, null, 2), 'utf8');
}

app.get('/api/films', async (req, res) => {
  try {
    const films = await readFilms();
    res.json(films);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read films' });
  }
});

app.post('/api/films', async (req, res) => {
  try {
    const films = await readFilms();
    const film = req.body;
    if (!film) return res.status(400).json({ error: 'Missing film data' });
    film._id = film._id || String(Date.now());
    films.unshift(film);
    await writeFilms(films);
    res.status(201).json(film);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add film' });
  }
});

app.put('/api/films/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const films = await readFilms();
    const idx = films.findIndex(f => String(f._id) === String(id) || String(f.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'Film not found' });
    const updated = Object.assign({}, films[idx], req.body);
    films[idx] = updated;
    await writeFilms(films);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update film' });
  }
});

app.delete('/api/films/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const films = await readFilms();
    const filtered = films.filter(f => String(f._id) !== String(id) && String(f.id) !== String(id));
    if (filtered.length === films.length) return res.status(404).json({ error: 'Film not found' });
    await writeFilms(filtered);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete film' });
  }
});

// Sync TMDB popular movies (200 films -> pages 1..10)
app.post('/api/sync-tmdb', async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY || req.body.apiKey;
    if (!apiKey) return res.status(400).json({ error: 'TMDB API key required. Set TMDB_API_KEY env or pass { apiKey } in body' });

    const movies = [];
    const perPage = 20; // TMDB returns 20 per page
    const pagesNeeded = 10; // 10 * 20 = 200

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

    await writeFilms(movies);
    res.json({ count: movies.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

async function ensureFilmsPresent() {
  try {
    const existing = await readFilms();
    const apiKey = process.env.TMDB_API_KEY;
    const forceSync = String(process.env.FORCE_TMDB_SYNC || '').toLowerCase() === 'true';

    if (existing && existing.length > 0 && !forceSync) {
      console.log('Existing data found — keeping current films. Set FORCE_TMDB_SYNC=true or call POST /api/sync-tmdb to force update.');
      return;
    }

    if (apiKey) {
      console.log('TMDB API key found — attempting to fetch top movies...');
      const movies = [];
      const pagesNeeded = 10;
      for (let page = 1; page <= pagesNeeded; page++) {
        const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&page=${page}`;
        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            console.warn('TMDB request failed on page', page, resp.status);
            break;
          }
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
        } catch (err) {
          console.warn('TMDB fetch error on page', page, err.message);
          break;
        }
      }
      if (movies.length >= 1) {
        await writeFilms(movies.slice(0, 200));
        console.log(`Saved ${Math.min(movies.length,200)} movies from TMDB to data file.`);
        return;
      }
      console.warn('TMDB fetch returned no movies — falling back to existing data/samples.');
    }

    if (existing && existing.length >= 200) {
      console.log('Existing data found (>=200) — keeping current films.');
      return;
    }

    console.log('No TMDB key or fetch failed — generating 200 sample films');
    const samples = [];
    for (let i = 1; i <= 200; i++) {
      const year = 1980 + (i % 40);
      samples.push({
        _id: `sample-${i}`,
        id: `sample-${i}`,
        title: `Sample Movie ${i}`,
        overview: `This is a generated sample movie entry number ${i}.`,
        poster_path: null,
        release_date: `${year}-01-01`,
        vote_average: (Math.round((Math.random() * 9 + 1) * 10) / 10)
      });
    }
    await writeFilms(samples);
    console.log('Saved 200 sample movies to data file.');
  } catch (err) {
    console.error('ensureFilmsPresent error:', err);
  }
}

ensureFilmsPresent().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to ensure films present:', err);
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
});
