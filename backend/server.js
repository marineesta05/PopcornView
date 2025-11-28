const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const fs = require('fs');
const fsp = require('fs').promises;
const cors = require('cors');

try {
  if (typeof fetch === 'undefined') global.fetch = require('node-fetch');
} catch (e) { }

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cookieParser());
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'popcorn_view',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;
async function initDb() {
  pool = await mysql.createPool(DB_CONFIG);
}

function signToken(payload) {
  const secret = process.env.JWT_SECRET || 'replace-me-with-secret';
  return jwt.sign(payload, secret, { expiresIn: '12h' });
}

async function getUserByEmail(email) {
  const [rows] = await pool.query('SELECT id, nom, prenom, email, role, password FROM users WHERE email = ?', [email]);
  return rows[0];
}

async function getUserById(id) {
  const [rows] = await pool.query('SELECT id, nom, prenom, email, role FROM users WHERE id = ?', [id]);
  return rows[0];
}

async function authenticateToken(req, res, next) {
  try {
    const token = (req.cookies && req.cookies.token) || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const secret = process.env.JWT_SECRET || 'replace-me-with-secret';
    const payload = jwt.verify(token, secret);
    const user = await getUserById(payload.id);
    if (!user) return res.status(401).json({ error: 'Invalid token (user not found)' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nom, prenom, email, password, role } = req.body || {};
    if (!email || !password || !nom || !prenom) return res.status(400).json({ error: 'nom, prenom, email and password required' });
    const existing = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing && existing[0] && existing[0].length > 0) return res.status(409).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)', [nom, prenom, email, role || 'user', hash]);
    const user = { id: result.insertId, nom, prenom, email, role: role || 'user' };
    res.status(201).json({ ok: true, user });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ id: user.id, role: user.role });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true, id: user.id, role: user.role });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nom, prenom, email, role FROM users ORDER BY id DESC');
    res.json(rows || []);
  } catch (err) {
    console.error('GET /api/users error', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { nom, prenom, email, password, role } = req.body || {};
    if (!nom || !prenom || !email || !password) return res.status(400).json({ error: 'nom, prenom, email and password required' });
    const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists && exists.length > 0) return res.status(409).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query('INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)', [nom, prenom, email, role || 'user', hash]);
    res.status(201).json({ id: r.insertId, nom, prenom, email, role: role || 'user' });
  } catch (err) {
    console.error('POST /api/users error', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { nom, prenom, email, password, role } = req.body || {};
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nom); }
    if (prenom !== undefined) { fields.push('prenom = ?'); values.push(prenom); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (role !== undefined) { fields.push('role = ?'); values.push(role); }
    if (password !== undefined && password !== '') {
      const hash = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hash);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(sql, values);
    const [rows] = await pool.query('SELECT id, nom, prenom, email, role FROM users WHERE id = ?', [id]);
    res.json(rows[0] || null);
  } catch (err) {
    console.error('PUT /api/users/:id error', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/users/:id error', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

const DATA_PATH = path.join(__dirname, 'data', 'films.json');

async function readStoredFilms() {
  try {
    const txt = await fsp.readFile(DATA_PATH, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (e) {
    return [];
  }
}

async function writeStoredFilms(arr) {
  await fsp.mkdir(path.dirname(DATA_PATH), { recursive: true });
  try {
    const newTxt = JSON.stringify(arr, null, 2);
    let existing = null;
    try { existing = await fsp.readFile(DATA_PATH, 'utf8'); } catch (e) { existing = null; }
    if (existing === newTxt) {
      return;
    }
    await fsp.writeFile(DATA_PATH, newTxt, 'utf8');
  } catch (e) {
    await fsp.writeFile(DATA_PATH, JSON.stringify(arr, null, 2), 'utf8');
  }
}

async function fetchTMDBMovies(apiKey, pagesNeeded = 10) {
  const movies = [];
  for (let page = 1; page <= pagesNeeded; page++) {
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&page=${page}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`TMDB request failed: ${resp.status}`);
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
  }
  return movies.slice(0, 200);
}

async function fetchAndStoreTMDB(apiKey, opts = {}) {
  const pagesNeeded = opts.pagesNeeded || 10;
  const movies = await fetchTMDBMovies(apiKey, pagesNeeded);
  return movies;
}

async function removeDeletedFlagsFromStored() {
  try {
    const films = await readStoredFilms();
    if (!Array.isArray(films) || films.length === 0) return;
    let changed = false;
    const cleaned = films.map(f => {
      if (f && f.deleted) { changed = true; const copy = Object.assign({}, f); delete copy.deleted; return copy; }
      return f;
    });
    if (changed) {
      await writeStoredFilms(cleaned);
      console.log('Removed deleted flags from stored films.');
    }
  } catch (e) {
    console.error('Failed to sanitize stored films:', e && e.message ? e.message : e);
  }
}

app.get('/api/films', async (req, res) => {
  try {
    const films = await readStoredFilms();
    const active = (films || []).filter(f => !f || !f.deleted ? true : false);
    res.json(active || []);
  } catch (err) {
    console.error('read films error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/films', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || (!payload.id && !payload._id)) return res.status(400).json({ error: 'Invalid payload, must include id or _id' });
    return res.status(405).json({ error: 'Adding arbitrary stored films is not supported. Use restore endpoint.' });
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
    const idx = films.findIndex(f => String(f._id) === id || String(f.id) === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    films[idx] = Object.assign({}, films[idx], { deleted: true });
    await writeStoredFilms(films);
    res.json({ ok: true });
  } catch (err) {
    console.error('delete films error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/films/deleted', async (req, res) => {
  try {
    const films = await readStoredFilms();
    const deleted = (films || []).filter(f => f && f.deleted);
    res.json(deleted || []);
  } catch (err) {
    console.error('read deleted films error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/films/:id/restore', async (req, res) => {
  try {
    const id = String(req.params.id);
    const deleted = await readStoredFilms();
    const idx = deleted.findIndex(f => String(f._id) === id || String(f.id) === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const removed = deleted.splice(idx, 1)[0];
    await writeStoredFilms(deleted);
    res.json({ ok: true, film: removed });
  } catch (err) {
    console.error('restore film error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/sync-tmdb', async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY || req.body.apiKey;
    if (!apiKey) return res.status(400).json({ error: 'TMDB API key required' });

    const movies = [];
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

app.post('/api/sync-tmdb/save', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY || req.body.apiKey;
    if (!apiKey) return res.status(400).json({ error: 'TMDB API key required' });
    const pagesNeeded = Number(req.body.pages || 10);
    const movies = await fetchAndStoreTMDB(apiKey, { pagesNeeded });
    res.json({ ok: true, count: movies.length });
  } catch (err) {
    console.error('sync-tmdb/save error', err && err.message ? err.message : err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/films/mark-deleted', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || (!payload.id && !payload._id)) return res.status(400).json({ error: 'Invalid payload, must include id or _id' });
    const idStr = String(payload._id || payload.id);
    const films = await readStoredFilms();
    const idx = (films || []).findIndex(f => String(f._id) === idStr || String(f.id) === idStr);
    if (idx !== -1) {
      films[idx] = Object.assign({}, films[idx], payload, { deleted: true });
    } else {
      const item = Object.assign({}, payload);
      if (!item._id) item._id = idStr;
      item.deleted = true;
      films.unshift(item);
    }
    await writeStoredFilms(films);
    res.json({ ok: true });
  } catch (err) {
    console.error('mark-deleted error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/films/clear-deleted-flags', async (req, res) => {
  try {
    await removeDeletedFlagsFromStored();
    res.json({ ok: true });
  } catch (err) {
    console.error('clear-deleted-flags error', err);
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

const FRONTEND_BUILD = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(FRONTEND_BUILD)) {
  app.use(express.static(FRONTEND_BUILD));
  app.get('/admin', authenticateToken, requireAdmin, (req, res) => {
    res.sendFile(path.join(FRONTEND_BUILD, 'index.html'));
  });
} else {
  app.get('/admin', authenticateToken, requireAdmin, (req, res) => {
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Admin</title></head><body><h2>Admin</h2><p>Frontend dev server not built. Open the React dev server at <a href="http://localhost:3000">http://localhost:3000</a> and authenticate in the UI.</p></body></html>`);
  });
}

initDb().then(() => {
  (async function ensureAdmin() {
    try {
      const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin1@gmail.com';
      const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin@123';
      const ADMIN_NOM = process.env.ADMIN_NOM || 'jessica';
      const ADMIN_PRENOM = process.env.ADMIN_PRENOM || 'admin';

      const [rows] = await pool.query('SELECT id, password FROM users WHERE email = ?', [ADMIN_EMAIL]);
      if (rows && rows.length > 0) {
        const user = rows[0];
        const pw = user.password || '';
        const looksHashed = typeof pw === 'string' && pw.startsWith('$2');
        if (!looksHashed) {
          const hash = await bcrypt.hash(ADMIN_PASS, 10);
          await pool.query('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
          console.log(`Updated existing admin (${ADMIN_EMAIL}) password to bcrypt hash.`);
        } else {
          console.log(`Admin (${ADMIN_EMAIL}) exists and password looks hashed.`);
        }
      } else {
        const hash = await bcrypt.hash(ADMIN_PASS, 10);
        const [r] = await pool.query('INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)', [ADMIN_NOM, ADMIN_PRENOM, ADMIN_EMAIL, 'admin', hash]);
        console.log(`Created admin user ${ADMIN_EMAIL} (id ${r.insertId}).`);
      }
    } catch (err) {
      console.error('ensureAdmin error', err);
    }

    try {
      await fsp.mkdir(path.dirname(DATA_PATH), { recursive: true });
      try {
        await fsp.access(DATA_PATH);
        console.log('Films storage file exists - using it.');
      } catch (_) {
        await writeStoredFilms([]);
        console.log('Created empty films storage at data/films.json');
      }

      const preloadMode = (process.env.TMDB_PRELOAD_MODE || '').toLowerCase();
      const apiKey = process.env.TMDB_API_KEY;
      if (apiKey && preloadMode === 'always') {
        try {
          console.log('TMDB_PRELOAD_MODE=always — fetching and overwriting stored films from TMDB...');
          const movies = await fetchAndStoreTMDB(apiKey, { pagesNeeded: 10 });
          await writeStoredFilms(movies);
          console.log(`Preloaded ${movies.length} films from TMDB to data/films.json`);
        } catch (e) {
          console.error('Failed to preload TMDB catalog on startup:', e && e.message ? e.message : e);
        }
        try { await removeDeletedFlagsFromStored(); } catch (e) { }
      }

      try { await removeDeletedFlagsFromStored(); } catch (e) { }
    } catch (e) {
      console.error('Error ensuring deleted films storage exists:', e && e.message ? e.message : e);
    }

    app.listen(PORT, () => {
      console.log(`Backend server listening on http://localhost:${PORT}`);
    });
  })();
}).catch(err => {
  console.error('Failed to initialize DB pool (continuing without DB):', err);
  app.listen(PORT, () => {
    console.log(`Backend server listening on http://localhost:${PORT} (DB not initialized)`);
  });
});

