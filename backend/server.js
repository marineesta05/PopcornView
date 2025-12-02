const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'replace-me-with-secret') {
    console.error(' ERREUR CRITIQUE: JWT_SECRET invalide ou non défini');
    process.exit(1);
}

const express = require('express');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const fs = require('fs');
const fsp = require('fs').promises;
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

try {
  if (typeof fetch === 'undefined') global.fetch = require('node-fetch');
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:", "https://image.tmdb.org"],
            connectSrc: ["'self'", "https://api.themoviedb.org"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true
}));

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes, réessayez plus tard' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    message: { error: 'Trop de tentatives de connexion' }
});

app.use('/api/', generalLimiter);
app.use(cookieParser());
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10kb' })); 


const DB_CONFIG = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'popcorn_view',
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    acquireTimeout: 10000,
    timeout: 60000
};

let pool;
async function initDb() {
    pool = await mysql.createPool(DB_CONFIG);
}

const csrfTokens = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of csrfTokens.entries()) {
        if (now - data.timestamp > 3600000) { 
            csrfTokens.delete(userId);
        }
    }
}, 3600000);

function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function verifyCsrf(req, res, next) {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
    
    const cookieToken = req.cookies && req.cookies['XSRF-TOKEN'];
    const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
    
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    
    if (req.user?.id) {
        const stored = csrfTokens.get(req.user.id);
        if (!stored || stored.token !== cookieToken) {
            return res.status(403).json({ error: 'CSRF token mismatch' });
        }
    }
    
    next();
}

function signToken(payload) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET not configured');
    }
    return jwt.sign(payload, secret, { expiresIn: '12h' });
}

async function getUserByEmail(email) {
    const [rows] = await pool.query(
        'SELECT id, nom, prenom, email, role, password FROM users WHERE email = ?', 
        [email]
    );
    return rows[0];
}

async function getUserById(id) {
    const [rows] = await pool.query(
        'SELECT id, nom, prenom, email, role FROM users WHERE id = ?', 
        [id]
    );
    return rows[0];
}

async function authenticateToken(req, res, next) {
    try {
        const token = (req.cookies && req.cookies.token) || 
                      (req.headers.authorization || '').replace(/^Bearer\s+/, '');
        
        if (!token) return res.status(401).json({ error: 'Missing token' });
        
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET not configured');
        }
        
        const payload = jwt.verify(token, secret);
        const user = await getUserById(payload.id);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid token (user not found)' });
        }
        
        req.user = user;
        next();
    } catch (err) {
        console.error('Auth error:', err.message);
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        console.warn(`[SECURITY] Unauthorized admin access attempt by user ${req.user?.id}`);
        return res.status(403).json({ error: 'Admin only' });
    }
    next();
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Mot de passe requis' };
    }
    
    const pass = String(password);
    if (pass.length < 12) {
        return { valid: false, error: 'Minimum 12 caractères requis' };
    }
    
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[@$!%*?&^#()\[\]{}<>~`_+=|:;.,\/\\-]/];
    const matched = classes.reduce((c, rx) => c + (rx.test(pass) ? 1 : 0), 0);
    
    if (matched < 3) {
        return { 
            valid: false, 
            error: 'Doit inclure 3 types: majuscule, minuscule, chiffre, spécial' 
        };
    }
    
    return { valid: true };
}

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { nom, prenom, email, password, role } = req.body || {};
        
        if (!email || !password || !nom || !prenom) {
            return res.status(400).json({ 
                error: 'nom, prenom, email et password requis' 
            });
        }
        
        const existing = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing && existing[0] && existing[0].length > 0) {
            return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }
        
        const pwValidation = validatePassword(password);
        if (!pwValidation.valid) {
            return res.status(400).json({ error: pwValidation.error });
        }
        
        const hash = await bcrypt.hash(password, 12);
        
        const [result] = await pool.query(
            'INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, email, role || 'user', hash]
        );
        
        const user = { 
            id: result.insertId, 
            nom, 
            prenom, 
            email, 
            role: role || 'user' 
        };
        
        const csrf = generateCsrfToken();
        csrfTokens.set(user.id, { token: csrf, timestamp: Date.now() });
        
        res.cookie('XSRF-TOKEN', csrf, { 
            httpOnly: false, 
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'strict' 
        });
        
        res.status(201).json({ ok: true, user });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email et password requis' });
        }
        
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Identifiants invalides' });
        }
        
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            return res.status(401).json({ error: 'Identifiants invalides' });
        }
        
        const token = signToken({ id: user.id, role: user.role });
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 60 * 1000 
        });
        
        const csrf = generateCsrfToken();
        csrfTokens.set(user.id, { token: csrf, timestamp: Date.now() });
        
        res.cookie('XSRF-TOKEN', csrf, { 
            httpOnly: false, 
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'strict' 
        });
        
        res.json({ ok: true, id: user.id, role: user.role });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


app.post('/api/auth/logout', authenticateToken, (req, res) => {
  
    csrfTokens.delete(req.user.id);
    
    res.clearCookie('token');
    res.clearCookie('XSRF-TOKEN');
    res.json({ ok: true });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({
    user: req.user,
    token: req.cookies.token
});
});

app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, nom, prenom, email, role FROM users ORDER BY id DESC'
        );
        res.json(rows || []);
    } catch (err) {
        console.error('GET /api/users error:', err);
        res.status(500).json({ error: 'Erreur chargement utilisateurs' });
    }
});

app.post('/api/users', authenticateToken, requireAdmin, verifyCsrf, async (req, res) => {
    try {
        const { nom, prenom, email, password, role } = req.body || {};
        
        if (!nom || !prenom || !email || !password) {
            return res.status(400).json({ 
                error: 'Tous les champs sont requis' 
            });
        }
        
        const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (exists && exists.length > 0) {
            return res.status(409).json({ error: 'Email déjà utilisé' });
        }
        
        const pwValidation = validatePassword(password);
        if (!pwValidation.valid) {
            return res.status(400).json({ error: pwValidation.error });
        }
        
        const hash = await bcrypt.hash(password, 12);
        const [r] = await pool.query(
            'INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, email, role || 'user', hash]
        );
        
        console.log(`[AUDIT] Admin ${req.user.id} created user ${r.insertId}`);
        
        res.status(201).json({ 
            id: r.insertId, 
            nom, 
            prenom, 
            email, 
            role: role || 'user' 
        });
    } catch (err) {
        console.error('POST /api/users error:', err);
        res.status(500).json({ error: 'Erreur création utilisateur' });
    }
});

app.put('/api/users/:id', authenticateToken, verifyCsrf, async (req, res) => {
    try {
        const id = req.params.id;
        const { nom, prenom, email, password, role } = req.body || {};
        
        if (!req.user || (req.user.id !== Number(id) && req.user.role !== 'admin')) {
            console.warn(`[SECURITY] IDOR attempt: User ${req.user?.id} tried to modify user ${id}`);
            return res.status(403).json({ error: 'Accès interdit' });
        }
        
        if (req.user.role === 'admin' && req.user.id === Number(id) && role && role !== req.user.role) {
            return res.status(403).json({ 
                error: 'Vous ne pouvez pas modifier votre propre rôle' 
            });
        }
        
        if (password && password !== '') {
            const pwValidation = validatePassword(password);
            if (!pwValidation.valid) {
                return res.status(400).json({ error: pwValidation.error });
            }
        }
        
        const fields = [];
        const values = [];
        
        if (nom !== undefined) { fields.push('nom = ?'); values.push(nom); }
        if (prenom !== undefined) { fields.push('prenom = ?'); values.push(prenom); }
        if (email !== undefined) { fields.push('email = ?'); values.push(email); }
        if (role !== undefined) { fields.push('role = ?'); values.push(role); }
        
        if (password !== undefined && password !== '') {
            const hash = await bcrypt.hash(password, 12);
            fields.push('password = ?');
            values.push(hash);
        }
        
        if (fields.length === 0) {
            return res.status(400).json({ error: 'Aucun champ à modifier' });
        }
        
        values.push(id);
        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
        await pool.query(sql, values);
        
        if (req.user.role === 'admin' && req.user.id !== Number(id)) {
            console.log(`[AUDIT] Admin ${req.user.id} modified user ${id}`, {
                changed: Object.keys(req.body),
                timestamp: new Date().toISOString()
            });
        }
        
        const [rows] = await pool.query(
            'SELECT id, nom, prenom, email, role FROM users WHERE id = ?', 
            [id]
        );
        res.json(rows[0] || null);
    } catch (err) {
        console.error('PUT /api/users/:id error:', err);
        res.status(500).json({ error: 'Erreur mise à jour utilisateur' });
    }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, verifyCsrf, async (req, res) => {
    try {
        const id = req.params.id;
        
        if (Number(id) === req.user.id) {
            return res.status(403).json({ 
                error: 'Vous ne pouvez pas supprimer votre propre compte' 
            });
        }
        
        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        
        console.log(`[AUDIT] Admin ${req.user.id} deleted user ${id}`);
        
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/users/:id error:', err);
        res.status(500).json({ error: 'Erreur suppression utilisateur' });
    }
});

const DATA_PATH = path.join(__dirname, 'data', 'films.json');

function isValidDataPath(filepath) {
    const resolved = path.resolve(filepath);
    const dataDir = path.resolve(__dirname, 'data');
    return resolved.startsWith(dataDir);
}

async function readStoredFilms() {
    try {
        if (!isValidDataPath(DATA_PATH)) {
            throw new Error('Invalid data path');
        }
        const txt = await fsp.readFile(DATA_PATH, 'utf8');
        return JSON.parse(txt || '[]');
    } catch (e) {
        return [];
    }
}

async function writeStoredFilms(arr) {
    try {
        if (!isValidDataPath(DATA_PATH)) {
            throw new Error('Invalid data path');
        }
        await fsp.mkdir(path.dirname(DATA_PATH), { recursive: true });
        const newTxt = JSON.stringify(arr, null, 2);
        await fsp.writeFile(DATA_PATH, newTxt, 'utf8');
    } catch (e) {
        console.error('Error writing films:', e);
        throw e;
    }
}


app.get('/api/films', async (req, res) => {
    try {
        const films = await readStoredFilms();
        const active = (films || []).filter(f => !f || !f.deleted);
        res.json(active || []);
    } catch (err) {
        console.error('GET /api/films error:', err);
        res.status(500).json({ error: 'Erreur lecture films' });
    }
});


app.post('/api/films', authenticateToken, requireAdmin, verifyCsrf, async (req, res) => {
    try {
        const payload = req.body;
        
        if (!payload || (!payload.id && !payload._id)) {
            return res.status(400).json({ 
                error: 'ID requis (id ou _id)' 
            });
        }
        
        const idStr = String(payload._id || payload.id);
        const films = await readStoredFilms();
        
        const existingIdx = (films || []).findIndex(f => 
            String(f._id) === idStr || String(f.id) === idStr
        );
        
        const item = Object.assign({}, payload);
        if (!item._id) item._id = idStr;
        if (item.deleted) delete item.deleted;
        
        if (existingIdx !== -1) {
            films[existingIdx] = Object.assign({}, films[existingIdx], item);
        } else {
            films.unshift(item);
        }
        
        await writeStoredFilms(films);
        
        console.log(`[AUDIT] Admin ${req.user.id} added/updated film ${idStr}`);
        
        res.status(201).json({ ok: true, film: item });
    } catch (err) {
        console.error('POST /api/films error:', err);
        res.status(500).json({ error: 'Erreur ajout film' });
    }
});

app.put('/api/films/:id', authenticateToken, requireAdmin, verifyCsrf, async (req, res) => {
    try {
        const id = String(req.params.id);
        const payload = req.body;
        const films = await readStoredFilms();
        
        const idx = films.findIndex(f => 
            String(f._id) === id || String(f.id) === id
        );
        
        if (idx === -1) {
            return res.status(404).json({ error: 'Film non trouvé' });
        }
        
        films[idx] = Object.assign({}, films[idx], payload);
        await writeStoredFilms(films);
        
        console.log(`[AUDIT] Admin ${req.user.id} modified film ${id}`);
        
        res.json(films[idx]);
    } catch (err) {
        console.error('PUT /api/films/:id error:', err);
        res.status(500).json({ error: 'Erreur mise à jour film' });
    }
});

app.delete('/api/films/:id', authenticateToken, requireAdmin, verifyCsrf, async (req, res) => {
    try {
        const id = String(req.params.id);
        const films = await readStoredFilms();
        const idx = films.findIndex(f => 
            String(f._id) === id || String(f.id) === id
        );
        
        if (idx === -1) {
            const item = { _id: id, id: isNaN(Number(id)) ? id : Number(id), deleted: true };
            films.unshift(item);
        } else {
            films[idx] = Object.assign({}, films[idx], { deleted: true });
        }
        
        await writeStoredFilms(films);
        
        console.log(`[AUDIT] Admin ${req.user.id} deleted film ${id}`);
        
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE /api/films/:id error:', err);
        res.status(500).json({ error: 'Erreur suppression film' });
    }
});

function validateHttpsUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:';
    } catch {
        return false;
    }
}



app.get('/api/catalog', async (req, res) => {
    try {
        const pagesNeeded = Number(req.query.pages || 10);
        const stored = await readStoredFilms();
        const storedMap = new Map((stored || []).map(f => [String(f._id || f.id), f]));
        
        const apiKey = process.env.TMDB_API_KEY;
        let tmdb = [];
        
        if (apiKey) {
            try {
                const movies = [];
                for (let page = 1; page <= pagesNeeded; page++) {
                    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&page=${page}`;
                    if (!validateHttpsUrl(url)) {
                        throw new Error('Only HTTPS URLs are allowed');
                    }
                    const resp = await fetch(url);
                    if (!resp.ok) break;
                    const data = await resp.json();
                    if (Array.isArray(data.results)) {
                        movies.push(...data.results.map(m => ({
                            _id: String(m.id),
                            id: m.id,
                            title: m.title,
                            overview: m.overview,
                            poster_path: m.poster_path,
                            release_date: m.release_date,
                            vote_average: m.vote_average
                        })));
                    }
                }
                tmdb = movies;
            } catch (e) {
                console.error('TMDB fetch error:', e);
            }
        }
        
        const source = (Array.isArray(tmdb) && tmdb.length > 0) ? tmdb : (stored || []);
        const merged = (source || []).map(m => {
            const idStr = String(m._id || m.id);
            const s = storedMap.get(idStr);
            const added = !!s && !s.deleted;
            const deleted = !!s && !!s.deleted;
            const base = Object.assign({}, m, s || {});
            return Object.assign({}, base, { added, deleted });
        }).slice(0, 200);
        
        res.json({ page: 1, total_pages: 1, results: merged });
    } catch (err) {
        console.error('GET /api/catalog error:', err);
        res.status(500).json({ error: 'Erreur catalogue' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        tmdb_key_present: !!process.env.TMDB_API_KEY,
        jwt_configured: !!process.env.JWT_SECRET
    });
});


// Proxy pour les reviews
app.post('/api/reviews', authenticateToken, async (req, res) => {
    try {
        const { movie_id, rating, comment } = req.body;
        
        const reviewData = {
            movie_id,
            rating,
            comment,
            user_id: req.user.id
        };

        const token = req.cookies.token || 
                     (req.headers.authorization || '').replace(/^Bearer\s+/, '');
        
        if (!token) {
            return res.status(401).json({ error: 'Token manquant' });
        }
        
        const response = await fetch('http://localhost:3003/reviews', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(reviewData)
        });
        
        if (!response.ok) {
            throw new Error(`Reviews service error: ${response.status}`);
        }
        
        const result = await response.json();
        res.json(result);
    } catch (err) {
        console.error('Proxy review error:', err);
        res.status(500).json({ error: 'Failed to add review' });
    }
});

// Proxy pour les détails d'un film
app.get('/api/movies/:id', authenticateToken, async (req, res) => {
    try {
        const token = req.cookies.token || 
                     (req.headers.authorization || '').replace(/^Bearer\s+/, '');
        
        if (!token) {
            return res.status(401).json({ error: 'Token manquant' });
        }
        
        const response = await fetch(`http://localhost:4001/api/movies/${req.params.id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json(errorData || { error: 'Films service error' });
        }
        
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Proxy movie details error:', err);
        res.status(500).json({ error: 'Failed to fetch movie details' });
    }
});

// Proxy pour les reviews d'un film
app.get('/api/movies/:id/reviews', authenticateToken, async (req, res) => {
    try {
        const token = req.cookies.token || 
                     (req.headers.authorization || '').replace(/^Bearer\s+/, '');
        
        if (!token) {
            return res.status(401).json({ error: 'Token manquant' });
        }
        
        const response = await fetch(`http://localhost:4001/api/movies/${req.params.id}/reviews`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json(errorData || { error: 'Films service error' });
        }
        
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Proxy reviews error:', err);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});


initDb().then(() => {
    (async function ensureAdmin() {
        try {
            const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
            const ADMIN_PASS = process.env.ADMIN_PASSWORD;
            const ADMIN_NOM = process.env.ADMIN_NOM || 'Admin';
            const ADMIN_PRENOM = process.env.ADMIN_PRENOM || 'System';
            
            // ✅ Vérifier que les credentials admin sont définis
            if (!ADMIN_EMAIL || !ADMIN_PASS) {
                console.warn('⚠️  ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment variables');
                console.warn('⚠️  Skipping admin user creation');
                app.listen(PORT, () => {
                    console.log(` Server listening on http://localhost:${PORT}`);
                    console.log(` Security: Helmet, CSRF, Rate Limiting enabled`);
                });
                return;
            }
            
            const [rows] = await pool.query(
                'SELECT id, password FROM users WHERE email = ?', 
                [ADMIN_EMAIL]
            );
            
            if (rows && rows.length > 0) {
                const user = rows[0];
                const pw = user.password || '';
                const looksHashed = typeof pw === 'string' && pw.startsWith('$2');
                
                if (!looksHashed) {
                    const hash = await bcrypt.hash(ADMIN_PASS, 12);
                    await pool.query(
                        'UPDATE users SET password = ? WHERE id = ?', 
                        [hash, user.id]
                    );
                    console.log(` Admin password updated to bcrypt hash`);
                }
            } else {
                const hash = await bcrypt.hash(ADMIN_PASS, 12);
                const [r] = await pool.query(
                    'INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)',
                    [ADMIN_NOM, ADMIN_PRENOM, ADMIN_EMAIL, 'admin', hash]
                );
                console.log(` Admin user created (id ${r.insertId})`);
            }
        } catch (err) {
            console.error('Admin setup error:', err);
        }
        
        app.listen(PORT, () => {
            console.log(` Server listening on http://localhost:${PORT}`);
            console.log(` Security: Helmet, CSRF, Rate Limiting enabled`);
        });
    })();
}).catch(err => {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
});