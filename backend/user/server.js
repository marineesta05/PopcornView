const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

dotenv.config({ path: '../.env' });
const db = require('../database.js');

function validateJwtSecret() {
    const MIN_LENGTH = 32;
    const secret = process.env.JWT_SECRET;
    
    if (!secret || secret === 'replace-me-with-secret') {
        console.error('❌ ERREUR CRITIQUE: JWT_SECRET non défini ou invalide');
        process.exit(1);
    }
    
    if (secret.length < MIN_LENGTH) {
        console.error(`❌ ERREUR: JWT_SECRET trop court (minimum ${MIN_LENGTH} caractères)`);
        process.exit(1);
    }
    
    const commonSecrets = ['secret', 'password', '123456', 'jwtsecret', 'changeme'];
    if (commonSecrets.includes(secret.toLowerCase())) {
        console.error('❌ ERREUR: JWT_SECRET trop commun');
        process.exit(1);
    }
    
    console.log('✓ JWT_SECRET validé');
}

validateJwtSecret();

const app = express();

// ========== MIDDLEWARES DE SÉCURITÉ ==========
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:4000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10kb' }));

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true
    },
    frameguard: { action: 'deny' },
    noSniff: true
}));

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    message: { error: 'Trop de tentatives, réessayez dans 15 minutes' }
});

// ========== FONCTIONS DE VALIDATION ==========
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    
    return validator.isEmail(email, {
        allow_display_name: false,
        require_tld: true,
        allow_utf8_local_part: false,
        blacklisted_chars: '<>"\''
    });
}

function isValidPassword(password) {
    if (!password || typeof password !== 'string') return false;
    
    const pass = String(password);
    
    if (pass.length < 12) return false;
    
    const classes = [
        /[a-z]/,
        /[A-Z]/,
        /\d/,
        /[@$!%*?&^#()\[\]{}<>~`_+=|:;.,\/\\-]/
    ];
    
    const matched = classes.reduce((count, regex) => 
        count + (regex.test(pass) ? 1 : 0), 0
    );
    
    return matched >= 3;
}

// ========== ROUTES ==========
app.post('/register', authLimiter, async (req, res) => {
    const { nom, prenom, email, password, role } = req.body;

    if (!nom || !prenom || !email || !password) {
        return res.status(400).json({ 
            message: 'Tous les champs sont requis',
            code: 'MISSING_FIELDS'
        });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ 
            message: 'Format d\'email invalide',
            code: 'INVALID_EMAIL'
        });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({ 
            message: 'Le mot de passe doit contenir au moins 12 caractères et inclure au moins 3 types : majuscule, minuscule, chiffre, caractère spécial',
            code: 'WEAK_PASSWORD'
        });
    }

    try {
        const [existingUsers] = await db.query(
            'SELECT id FROM users WHERE email = ?', 
            [email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(409).json({ 
                message: 'Cet email est déjà utilisé',
                code: 'EMAIL_EXISTS'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const userRole = role === 'admin' ? 'admin' : 'user';

        const [result] = await db.query(
            'INSERT INTO users (nom, prenom, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, email, hashedPassword, userRole]
        );

        const token = jwt.sign(
            { 
                id: result.insertId,
                userId: result.insertId,
                role: userRole,
                email: email
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: '12h' }
        );

        // Cookie token - visible dans l'inspecteur
        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie('token', token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax', 
            maxAge: 12 * 60 * 60 * 1000,
            path: '/'
        });

        // Cookie CSRF - visible dans l'inspecteur
        const csrf = crypto.randomBytes(32).toString('hex');
        res.cookie('XSRF-TOKEN', csrf, { 
            httpOnly: false, 
            secure: isProduction, 
            sameSite: isProduction ? 'strict' : 'lax', 
            path: '/' 
        });

        console.log(`[AUDIT] New user registered: ${result.insertId} (${email})`);

        return res.status(201).json({ 
            message: 'Inscription réussie',
            token,
            user: {
                id: result.insertId,
                nom,
                prenom,
                email,
                role: userRole
            },
            cookies_set: {
                token: {
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: isProduction ? 'strict' : 'lax',
                    maxAge: '12h'
                },
                'XSRF-TOKEN': {
                    httpOnly: false,
                    secure: isProduction,
                    sameSite: isProduction ? 'strict' : 'lax'
                }
            }
        });

    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ 
            message: 'Erreur serveur',
            code: 'SERVER_ERROR'
        });
    }
});

app.post('/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ 
            message: "Email et mot de passe requis",
            code: 'MISSING_CREDENTIALS'
        });
    }

    try {
        const [results] = await db.query(
            'SELECT * FROM users WHERE email = ?', 
            [email]
        );

        if (results.length === 0) {
            return res.status(401).json({ 
                message: "Identifiants invalides",
                code: 'INVALID_CREDENTIALS'
            });
        }

        const user = results[0];

        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                message: "Identifiants invalides",
                code: 'INVALID_CREDENTIALS'
            });
        }

        const token = jwt.sign(
            { 
                id: user.id,
                userId: user.id,
                role: user.role,
                email: user.email
            },
            process.env.JWT_SECRET,
            { expiresIn: "12h" }
        );

        // Cookie token - visible dans l'inspecteur
        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie('token', token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax', // ✅ LAX en dev
            maxAge: 12 * 60 * 60 * 1000,
            path: '/'
        });

        // Cookie CSRF - visible dans l'inspecteur
        const csrf = crypto.randomBytes(32).toString('hex');
        res.cookie('XSRF-TOKEN', csrf, { 
            httpOnly: false, 
            secure: isProduction, 
            sameSite: isProduction ? 'strict' : 'lax', // ✅ LAX en dev
            path: '/'
        });

        console.log(`[AUDIT] User logged in: ${user.id} (${user.email})`);

        return res.status(200).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                nom: user.nom,
                prenom: user.prenom
            },
            cookies_set: {
                token: {
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: isProduction ? 'strict' : 'lax',
                    maxAge: '12h'
                },
                'XSRF-TOKEN': {
                    httpOnly: false,
                    secure: isProduction,
                    sameSite: isProduction ? 'strict' : 'lax'
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ 
            message: "Erreur serveur",
            code: 'SERVER_ERROR'
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'user-auth',
        jwt_configured: !!process.env.JWT_SECRET,
        timestamp: new Date().toISOString()
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route non trouvée',
        code: 'NOT_FOUND'
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Erreur serveur interne',
        code: 'INTERNAL_ERROR'
    });
});

const PORT = process.env.SERVER_PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 User Auth Service sur http://localhost:${PORT}`);
    console.log(`🔒 Security: Helmet, Rate Limiting, Validation enabled`);
});

module.exports = app;