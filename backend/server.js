const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const app = require('./index.js');

app.use(cookieParser());

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
    const token = req.cookies && req.cookies.token || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
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
    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'User exists' });
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

const fs = require('fs');
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

const PORT = process.env.PORT || 4000;
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

    app.listen(PORT, () => {
      console.log(`Backend server listening on http://localhost:${PORT}`);
    });
  })();
}).catch(err => {
  console.error('Failed to initialize DB pool', err);
  process.exit(1);
});