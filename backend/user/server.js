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

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'replace-me-with-secret') {
    console.error('ERREUR: JWT_SECRET invalide ou non défini');
    process.exit(1);
}

const app = express();


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


app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:4000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10kb' }));


const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  
    max: 5,  
    skipSuccessfulRequests: true,
    standardHeaders: true,
    message: { error: 'Trop de tentatives, réessayez dans 15 minutes' }
});


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


app.post('/register', authLimiter, async (req, res) => {
    const { nom, prenom, email, password, role } = req.body;

    if (!nom || !prenom || !email || !password) {
        return res.status(400).json({ 
            message: 'Tous les champs sont requis' 
        });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ 
            message: 'Format d\'email invalide' 
        });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({ 
            message: 'Le mot de passe doit contenir au moins 12 caractères et inclure au moins 3 types : majuscule, minuscule, chiffre, caractère spécial' 
        });
    }

    try {
    
        const [existingUsers] = await db.query(
            'SELECT * FROM users WHERE email = ?', 
            [email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(409).json({ 
                message: 'Cet email est déjà utilisé' 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const userRole = role || 'user';

        const [result] = await db.query(
            'INSERT INTO users (nom, prenom, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, email, hashedPassword, userRole]
        );

        const token = jwt.sign(
            { userId: result.insertId, role: userRole }, 
            process.env.JWT_SECRET, 
            { expiresIn: '12h' }
        );

        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 60 * 1000 
        });

        const csrf = crypto.randomBytes(32).toString('hex');
        res.cookie('XSRF-TOKEN', csrf, { 
            httpOnly: false, 
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'strict' 
        });

        console.log(`[AUDIT] New user registered: ${result.insertId} (${email})`);

        res.status(201).json({ 
            message: 'Inscription réussie',
            token,
            user: {
                id: result.insertId,
                nom,
                prenom,
                email,
                role: userRole
            }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ 
            message: 'Erreur serveur', 
            error: error.message 
        });
    }
});


app.post('/login', authLimiter, async (req, res) => {
    console.log('=== LOGIN ATTEMPT ===');
    
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ 
            message: "Email et mot de passe requis" 
        });
    }

    try {
        
        const [results] = await db.query(
            'SELECT * FROM users WHERE email = ?', 
            [email]
        );

        if (results.length === 0) {
            return res.status(401).json({ 
                message: "Identifiants invalides" 
            });
        }

        const user = results[0];

        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                message: "Identifiants invalides" 
            });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "12h" }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 60 * 1000
        });

        const csrf = crypto.randomBytes(32).toString('hex');
        res.cookie('XSRF-TOKEN', csrf, { 
            httpOnly: false, 
            secure: process.env.NODE_ENV === 'production', 
            sameSite: 'strict' 
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
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ 
            message: "Erreur serveur", 
            error: error.message 
        });
    }
});


app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'user-auth',
        jwt_configured: !!process.env.JWT_SECRET
    });
});


app.use((req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Erreur serveur interne'
    });
});


const PORT = process.env.SERVER_PORT || 3001;

app.listen(PORT, () => {
    console.log(` User Auth Service sur http://localhost:${PORT}`);
    console.log(` Security: Helmet, Rate Limiting, Validation enabled`);
});