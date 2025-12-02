const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ========== VALIDATION DES SECRETS ==========
const validateSecrets = () => {
    const MIN_JWT_SECRET_LENGTH = 32;
    
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'replace-me-with-secret') {
        console.error('❌ ERREUR CRITIQUE: JWT_SECRET invalide ou non défini');
        process.exit(1);
    }
    
    if (process.env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
        console.error(`❌ ERREUR: JWT_SECRET trop court (${process.env.JWT_SECRET.length} < ${MIN_JWT_SECRET_LENGTH})`);
        process.exit(1);
    }
    
    const commonSecrets = ['secret', 'password', '123456', 'jwtsecret', 'changeme'];
    if (commonSecrets.includes(process.env.JWT_SECRET.toLowerCase())) {
        console.error('❌ ERREUR: JWT_SECRET trop commun');
        process.exit(1);
    }
    
    console.log('✓ JWT_SECRET validé');
};
validateSecrets();

// ========== IMPORTS ==========
const express = require('express');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

// ========== INITIALISATION FETCH ==========
let fetch;
if (typeof globalThis.fetch === 'undefined') {
    try {
        fetch = require('node-fetch');
    } catch (e) {
        console.error('❌ ERREUR: node-fetch requis. Installez: npm install node-fetch@2');
        process.exit(1);
    }
} else {
    fetch = globalThis.fetch;
}

const app = express();
const PORT = process.env.PORT || 4000;

// ========== MIDDLEWARES DE SÉCURITÉ ==========
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
    hsts: process.env.NODE_ENV === 'production' ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    } : false,
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true
}));

// Rate limiting
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

// CORS sécurisé
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'http://localhost:3000']
    : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({ 
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
}));

app.use(express.json({ limit: '10kb' }));

// ========== CONFIGURATION BASE DE DONNÉES ==========
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

// ========== GESTION CSRF ==========
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
        console.warn('[SECURITY] Invalid CSRF token attempt');
        return res.status(403).json({ 
            error: 'Invalid CSRF token',
            code: 'INVALID_CSRF'
        });
    }
    
    if (req.user?.id) {
        const stored = csrfTokens.get(req.user.id);
        if (!stored || stored.token !== cookieToken) {
            console.warn(`[SECURITY] CSRF token mismatch for user ${req.user.id}`);
            return res.status(403).json({ 
                error: 'CSRF token mismatch',
                code: 'CSRF_MISMATCH'
            });
        }
    }
    
    next();
}

// ========== FONCTIONS DE VALIDATION ==========
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Mot de passe requis', code: 'PASSWORD_REQUIRED' };
    }
    
    const pass = String(password);
    if (pass.length < 12) {
        return { valid: false, error: 'Minimum 12 caractères requis', code: 'PASSWORD_TOO_SHORT' };
    }
    
    const classes = [
        /[a-z]/,
        /[A-Z]/,
        /\d/,
        /[@$!%*?&^#()\[\]{}<>~`_+=|:;.,\/\\-]/
    ];
    
    const matched = classes.reduce((count, regex) => count + (regex.test(pass) ? 1 : 0), 0);
    
    if (matched < 3) {
        return { 
            valid: false, 
            error: 'Doit inclure au moins 3 types: majuscule, minuscule, chiffre, caractère spécial',
            code: 'PASSWORD_WEAK'
        };
    }
    
    return { valid: true };
}

function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return validator.isEmail(email, {
        allow_display_name: false,
        require_tld: true,
        allow_utf8_local_part: false,
        blacklisted_chars: '<>"\''
    });
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

// ========== MIDDLEWARES D'AUTHENTIFICATION ==========
async function authenticateToken(req, res, next) {
    try {
        const token = (req.cookies && req.cookies.token) || 
                     (req.headers.authorization || '').replace(/^Bearer\s+/, '');
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Token manquant',
                code: 'TOKEN_MISSING'
            });
        }
        
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET non configuré');
        }
        
        const payload = jwt.verify(token, secret);
        const userId = parseInt(payload.id || payload.userId);
        
        if (isNaN(userId) || userId <= 0) {
            return res.status(401).json({ 
                error: 'Token invalide',
                code: 'TOKEN_INVALID'
            });
        }
        
        const user = await getUserById(userId);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Utilisateur non trouvé',
                code: 'USER_NOT_FOUND'
            });
        }
        
        req.user = user;
        next();
    } catch (err) {
        console.error('Auth error:', err.message);
        
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expiré',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Token invalide',
                code: 'TOKEN_INVALID'
            });
        }
        
        return res.status(500).json({ 
            error: 'Erreur d\'authentification',
            code: 'AUTH_ERROR'
        });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        console.warn(`[SECURITY] Unauthorized admin access attempt by user ${req.user?.id}`);
        return res.status(403).json({ 
            error: 'Accès réservé aux administrateurs',
            code: 'ADMIN_REQUIRED'
        });
    }
    next();
}

// ========== ROUTES D'AUTHENTIFICATION ==========
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { nom, prenom, email, password, role = 'user' } = req.body || {};
        
        if (!email || !password || !nom || !prenom) {
            return res.status(400).json({ 
                error: 'Nom, prénom, email et mot de passe requis',
                code: 'MISSING_FIELDS'
            });
        }
        
        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                error: 'Format d\'email invalide',
                code: 'INVALID_EMAIL'
            });
        }
        
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing && existing.length > 0) {
            return res.status(409).json({ 
                error: 'Cet email est déjà utilisé',
                code: 'EMAIL_EXISTS'
            });
        }
        
        const pwValidation = validatePassword(password);
        if (!pwValidation.valid) {
            return res.status(400).json({ 
                error: pwValidation.error,
                code: pwValidation.code
            });
        }
        
        const hash = await bcrypt.hash(password, 12);
        const userRole = role === 'admin' ? 'admin' : 'user';
        
        const [result] = await pool.query(
            'INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, email, userRole, hash]
        );
        
        const user = { 
            id: result.insertId, 
            nom, 
            prenom, 
            email, 
            role: userRole
        };
        
        const token = signToken({ 
            id: user.id,
            userId: user.id,
            role: userRole,
            email: email
        });
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 12 * 60 * 60 * 1000
        });
        
        const csrfToken = generateCsrfToken();
        csrfTokens.set(user.id, { token: csrfToken, timestamp: Date.now() });
        
        res.cookie('XSRF-TOKEN', csrfToken, { 
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        
        console.log(`[AUDIT] User registered: ${user.id} (${user.email})`);
        
        res.status(201).json({ 
            ok: true,
            token,
            user,
            code: 'REGISTRATION_SUCCESS'
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ 
            error: 'Erreur serveur lors de l\'inscription',
            code: 'REGISTRATION_ERROR'
        });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email et mot de passe requis',
                code: 'MISSING_CREDENTIALS'
            });
        }
        
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ 
                error: 'Identifiants invalides',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            return res.status(401).json({ 
                error: 'Identifiants invalides',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        const token = signToken({ 
            id: user.id,
            userId: user.id,
            role: user.role,
            email: user.email
        });
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 12 * 60 * 60 * 1000
        });
        
        const csrfToken = generateCsrfToken();
        csrfTokens.set(user.id, { token: csrfToken, timestamp: Date.now() });
        
        res.cookie('XSRF-TOKEN', csrfToken, { 
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        
        console.log(`[AUDIT] User logged in: ${user.id} (${user.email})`);
        
        res.json({ 
            ok: true,
            token,
            user: {
                id: user.id,
                nom: user.nom,
                prenom: user.prenom,
                email: user.email,
                role: user.role
            },
            code: 'LOGIN_SUCCESS'
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            error: 'Erreur serveur lors de la connexion',
            code: 'LOGIN_ERROR'
        });
    }
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
    csrfTokens.delete(req.user.id);
    
    res.clearCookie('token');
    res.clearCookie('XSRF-TOKEN');
    
    res.json({ 
        ok: true,
        code: 'LOGOUT_SUCCESS'
    });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({
        user: req.user,
        code: 'USER_INFO'
    });
});

// ========== ROUTES UTILISATEURS ==========
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, nom, prenom, email, role, created_at FROM users ORDER BY id DESC'
        );
        res.json({ 
            users: rows || [],
            code: 'USERS_LIST'
        });
    } catch (err) {
        console.error('GET /api/users error:', err);
        res.status(500).json({ 
            error: 'Erreur chargement utilisateurs',
            code: 'USERS_LOAD_ERROR'
        });
    }
});

app.post('/api/users', authenticateToken, requireAdmin, verifyCsrf, async (req, res) => {
    try {
        const { nom, prenom, email, password, role = 'user' } = req.body || {};
        
        if (!nom || !prenom || !email || !password) {
            return res.status(400).json({ 
                error: 'Tous les champs sont requis',
                code: 'MISSING_FIELDS'
            });
        }
        
        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                error: 'Format d\'email invalide',
                code: 'INVALID_EMAIL'
            });
        }
        
        const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (exists && exists.length > 0) {
            return res.status(409).json({ 
                error: 'Email déjà utilisé',
                code: 'EMAIL_EXISTS'
            });
        }
        
        const pwValidation = validatePassword(password);
        if (!pwValidation.valid) {
            return res.status(400).json({ 
                error: pwValidation.error,
                code: pwValidation.code
            });
        }
        
        const hash = await bcrypt.hash(password, 12);
        const userRole = role === 'admin' ? 'admin' : 'user';
        
        const [result] = await pool.query(
            'INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, email, userRole, hash]
        );
        
        console.log(`[AUDIT] Admin ${req.user.id} created user ${result.insertId}`);
        
        res.status(201).json({ 
            id: result.insertId,
            nom,
            prenom,
            email,
            role: userRole,
            code: 'USER_CREATED'
        });
    } catch (err) {
        console.error('POST /api/users error:', err);
        res.status(500).json({ 
            error: 'Erreur création utilisateur',
            code: 'USER_CREATE_ERROR'
        });
    }
});

app.put('/api/users/:id', authenticateToken, verifyCsrf, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { nom, prenom, email, password, role } = req.body || {};
        
        if (isNaN(userId) || userId <= 0) {
            return res.status(400).json({ 
                error: 'ID utilisateur invalide',
                code: 'INVALID_USER_ID'
            });
        }
        
        // Protection IDOR
        if (req.user.id !== userId && req.user.role !== 'admin') {
            console.warn(`[SECURITY] IDOR attempt: User ${req.user.id} tried to modify user ${userId}`);
            return res.status(403).json({ 
                error: 'Accès interdit',
                code: 'FORBIDDEN'
            });
        }
        
        // Un admin ne peut pas modifier son propre rôle
        if (req.user.id === userId && role && role !== req.user.role) {
            return res.status(403).json({ 
                error: 'Vous ne pouvez pas modifier votre propre rôle',
                code: 'SELF_ROLE_MODIFICATION'
            });
        }
        
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ 
                error: 'Format d\'email invalide',
                code: 'INVALID_EMAIL'
            });
        }
        
        if (password && password !== '') {
            const pwValidation = validatePassword(password);
            if (!pwValidation.valid) {
                return res.status(400).json({ 
                    error: pwValidation.error,
                    code: pwValidation.code
                });
            }
        }
        
        const fields = [];
        const values = [];
        
        if (nom !== undefined) { fields.push('nom = ?'); values.push(nom); }
        if (prenom !== undefined) { fields.push('prenom = ?'); values.push(prenom); }
        if (email !== undefined) { fields.push('email = ?'); values.push(email); }
        if (role !== undefined && req.user.role === 'admin') { 
            fields.push('role = ?'); 
            values.push(role === 'admin' ? 'admin' : 'user'); 
        }
        
        if (password !== undefined && password !== '') {
            const hash = await bcrypt.hash(password, 12);
            fields.push('password = ?');
            values.push(hash);
        }
        
        if (fields.length === 0) {
            return res.status(400).json({ 
                error: 'Aucun champ à modifier',
                code: 'NO_FIELDS_TO_UPDATE'
            });
        }
        
        values.push(userId);
        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
        await pool.query(sql, values);
        
        if (req.user.role === 'admin' && req.user.id !== userId) {
            console.log(`[AUDIT] Admin ${req.user.id} modified user ${userId}`);
        }
        
        const [rows] = await pool.query(
            'SELECT id, nom, prenom, email, role FROM users WHERE id = ?', 
            [userId]
        );
        
        res.json({ 
            user: rows[0] || null,
            code: 'USER_UPDATED'
        });
    } catch (err) {
        console.error('PUT /api/users/:id error:', err);
        res.status(500).json({ 
            error: 'Erreur mise à jour utilisateur',
            code: 'USER_UPDATE_ERROR'
        });
    }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, verifyCsrf, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId) || userId <= 0) {
            return res.status(400).json({ 
                error: 'ID utilisateur invalide',
                code: 'INVALID_USER_ID'
            });
        }
        
        if (userId === req.user.id) {
            return res.status(403).json({ 
                error: 'Vous ne pouvez pas supprimer votre propre compte',
                code: 'SELF_DELETION'
            });
        }
        
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        
        console.log(`[AUDIT] Admin ${req.user.id} deleted user ${userId}`);
        
        res.json({ 
            ok: true,
            message: 'Utilisateur supprimé',
            code: 'USER_DELETED'
        });
    } catch (err) {
        console.error('DELETE /api/users/:id error:', err);
        res.status(500).json({ 
            error: 'Erreur suppression utilisateur',
            code: 'USER_DELETE_ERROR'
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'auth-gateway',
        jwt_configured: !!process.env.JWT_SECRET,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'PopcornView Auth Gateway API',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                logout: 'POST /api/auth/logout',
                me: 'GET /api/auth/me'
            },
            users: {
                list: 'GET /api/users (admin)',
                create: 'POST /api/users (admin)',
                update: 'PUT /api/users/:id',
                delete: 'DELETE /api/users/:id (admin)'
            },
            health: 'GET /api/health'
        }
    });
});

app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route non trouvée',
        code: 'NOT_FOUND'
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    
    const response = {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    };
    
    if (process.env.NODE_ENV === 'development') {
        response.message = err.message;
    }
    
    res.status(500).json(response);
});

async function initDb() {
    pool = mysql.createPool(DB_CONFIG);
    
    // Test de connexion
    try {
        const connection = await pool.getConnection();
        console.log('✓ Connecté à MySQL');
        connection.release();
    } catch (err) {
        console.error('❌ Erreur connexion MySQL:', err.message);
        throw err;
    }
    
    return pool;
}

initDb().then(() => {
    (async function ensureAdmin() {
        try {
            const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
            const ADMIN_PASS = process.env.ADMIN_PASSWORD;
            const ADMIN_NOM = process.env.ADMIN_NOM || 'Admin';
            const ADMIN_PRENOM = process.env.ADMIN_PRENOM || 'System';
            
            if (!ADMIN_EMAIL || !ADMIN_PASS) {
                console.warn('⚠️  ADMIN_EMAIL et ADMIN_PASSWORD non définis');
                console.warn('   Création de l\'admin ignorée');
                startServer();
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
                    console.log('✓ Mot de passe admin mis à jour');
                } else {
                    console.log(`✓ Admin existant (id: ${user.id})`);
                }
            } else {
                const hash = await bcrypt.hash(ADMIN_PASS, 12);
                const [result] = await pool.query(
                    'INSERT INTO users (nom, prenom, email, role, password) VALUES (?, ?, ?, ?, ?)',
                    [ADMIN_NOM, ADMIN_PRENOM, ADMIN_EMAIL, 'admin', hash]
                );
                console.log(`✓ Admin créé (id: ${result.insertId})`);
            }
        } catch (err) {
            console.error('❌ Admin setup error:', err);
        }
        
        startServer();
    })();
}).catch(err => {
    console.error('❌ Failed to initialize DB:', err);
    process.exit(1);
});

function startServer() {
    app.listen(PORT, () => {
        console.log(`
🚀 Auth Gateway démarrée sur: http://localhost:${PORT}
🔒 Environnement: ${process.env.NODE_ENV || 'development'}
✓ JWT Auth: Configuré
✓ Admin: ${process.env.ADMIN_EMAIL ? 'Configuré' : 'Non configuré'}
  
📚 Documentation: http://localhost:${PORT}
🏥 Health check: http://localhost:${PORT}/api/health
        `);
    });
}

module.exports = app;