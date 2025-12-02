const express = require('express');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const { Server } = require("socket.io");

dotenv.config({ path: '../.env' });

// ========== VALIDATION JWT_SECRET ==========
function validateJwtSecret() {
    const MIN_LENGTH = 32;
    const secret = process.env.JWT_SECRET;
    
    if (!secret || secret === 'replace-me-with-secret') {
        console.error('❌ ERREUR: JWT_SECRET invalide');
        process.exit(1);
    }
    
    if (secret.length < MIN_LENGTH) {
        console.error(`❌ ERREUR: JWT_SECRET trop court (minimum ${MIN_LENGTH})`);
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

const sql = require('../database');

const app = express();
const server = http.createServer(app);

// ========== SÉCURITÉ HELMET ==========
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"]
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

// ========== CORS SÉCURISÉ ==========
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:4000'
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' }));

// ========== RATE LIMITING ==========
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de requêtes, réessayez plus tard' }
});

const createReviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    skipSuccessfulRequests: false,
    message: { message: 'Vous avez créé trop d\'avis récemment' }
});

app.use(generalLimiter);

// ========== SOCKET.IO SÉCURISÉ ==========
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.warn('[SECURITY] Invalid socket auth attempt');
            return next(new Error('Authentication error'));
        }
        socket.userId = decoded.id || decoded.userId;
        socket.userRole = decoded.role;
        next();
    });
});

io.on("connection", (socket) => {
    console.log(`✓ Client authentifié: ${socket.userId}`);
    socket.on("disconnect", () => {
        console.log("✓ Client déconnecté:", socket.id);
    });
});

// ========== MIDDLEWARE AUTH ==========
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    if (!token) {
        return res.status(401).json({ 
            message: 'Token manquant',
            code: 'TOKEN_MISSING' 
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT verification error:', err.message);
            return res.status(403).json({ 
                message: 'Token invalide ou expiré',
                code: 'TOKEN_INVALID' 
            });
        }
        req.userId = user.id || user.userId;
        req.userRole = user.role;
        next();
    });
}

// ========== SANITIZATION ==========
function sanitizeHtml(text, maxLength = 10000) {
    if (typeof text !== 'string') {
        return '';
    }
    
    let sanitized = text.substring(0, maxLength);
    
    // Supprimer les balises dangereuses
    const dangerousPatterns = [
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
        /<object\b[^>]*>[\s\S]*?<\/object>/gi,
        /<embed\b[^>]*>/gi,
        /<link\b[^>]*>/gi,
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        /<meta\b[^>]*>/gi,
        /\s+on\w+\s*=\s*["'][^"']*["']/gi,
        /\s+on\w+\s*=\s*[^\s>]*/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /data:text\/html/gi
    ];
    
    dangerousPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
    });
    
    // Supprimer toutes les balises HTML
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Encoder les entités HTML
    const htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;'
    };
    
    sanitized = sanitized.replace(/[&<>"'/]/g, (match) => htmlEntities[match] || match);
    
    // Supprimer les espaces multiples
    sanitized = sanitized.replace(/\s{2,}/g, ' ');
    
    return sanitized.trim();
}

// ========== VALIDATEURS ==========
const validateReview = [
    body('movie_id')
        .isInt({ min: 1 })
        .withMessage('ID du film invalide')
        .toInt(),
    body('rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('La note doit être entre 1 et 5')
        .toInt(),
    body('comment')
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('Le commentaire doit contenir entre 1 et 1000 caractères')
        .customSanitizer(value => sanitizeHtml(value))
];

const validateReviewUpdate = [
    param('id').isInt({ min: 1 }).withMessage('ID invalide').toInt(),
    body('rating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('La note doit être entre 1 et 5')
        .toInt(),
    body('comment')
        .optional()
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('Le commentaire doit contenir entre 1 et 1000 caractères')
        .customSanitizer(value => sanitizeHtml(value))
];

const validateMovieId = [
    param('movie_id').isInt({ min: 1 }).toInt()
];

const validateReviewId = [
    param('id').isInt({ min: 1 }).toInt()
];

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            message: 'Données invalides',
            errors: errors.array() 
        });
    }
    next();
}

// ========== ROUTES ==========

// POST: Créer une review
app.post('/reviews', 
    authenticateToken, 
    createReviewLimiter,
    validateReview, 
    handleValidationErrors, 
    async (req, res) => {
        const { movie_id, rating, comment } = req.body;
        const user_id = req.userId;

        try {
            const [existingReview] = await sql.query(
                'SELECT id FROM avis WHERE movie_id = ? AND user_id = ?',
                [movie_id, user_id]
            );

            if (existingReview.length > 0) {
                return res.status(409).json({ 
                    message: 'Vous avez déjà posté un avis pour ce film',
                    code: 'DUPLICATE_REVIEW'
                });
            }

            const [result] = await sql.query(
                'INSERT INTO avis (movie_id, user_id, note, commentaire) VALUES (?, ?, ?, ?)',
                [movie_id, user_id, rating, comment]
            );

            const [newReview] = await sql.query(
                `SELECT a.id, a.movie_id, a.user_id, a.note as rating, 
                        a.commentaire as comment, u.email 
                 FROM avis a 
                 LEFT JOIN users u ON a.user_id = u.id 
                 WHERE a.id = ?`,
                [result.insertId]
            );

            const reviewWithEmail = newReview[0];
            
            console.log(`[AUDIT] User ${user_id} created review ${result.insertId} for movie ${movie_id}`);
            
            io.emit('reviewAdded', reviewWithEmail);
            res.status(201).json(reviewWithEmail);
        } catch (error) {
            console.error('Erreur création avis:', error);
            res.status(500).json({ 
                message: 'Erreur serveur',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// GET: Toutes les reviews
app.get('/reviews', async (req, res) => {
    try {
        const [result] = await sql.query(
            `SELECT a.id, a.movie_id, a.user_id, 
                   a.note as rating, a.commentaire as comment, 
                   u.email 
            FROM avis a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.id DESC`
        );
        res.status(200).json(result);
    } catch (error) {
        console.error('Erreur récupération avis:', error);
        res.status(500).json({ 
            message: 'Erreur serveur',
            code: 'SERVER_ERROR'
        });
    }
});

// GET: Reviews d'un film
app.get('/reviews/movie/:movie_id', 
    validateMovieId,
    handleValidationErrors,
    async (req, res) => {
        const { movie_id } = req.params;
        
        try {
            const [result] = await sql.query(
                `SELECT a.id, a.movie_id, a.user_id,
                       a.note as rating, a.commentaire as comment,
                       u.email 
                FROM avis a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE a.movie_id = ?
                ORDER BY a.id DESC`,
                [movie_id]
            );
            res.status(200).json(result);
        } catch (error) {
            console.error('Erreur récupération avis:', error);
            res.status(500).json({ 
                message: 'Erreur serveur',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// PUT: Modifier une review
app.put('/reviews/:id', 
    authenticateToken,
    validateReviewUpdate,
    handleValidationErrors,
    async (req, res) => {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const user_id = req.userId;

        try {
            const [currentReview] = await sql.query(
                'SELECT * FROM avis WHERE id = ?',
                [id]
            );
            
            if (currentReview.length === 0) {
                return res.status(404).json({ 
                    message: 'Avis non trouvé',
                    code: 'NOT_FOUND'
                });
            }

            // Protection IDOR
            if (currentReview[0].user_id !== user_id) {
                console.warn(`[SECURITY] IDOR attempt: User ${user_id} tried to modify review ${id}`);
                return res.status(403).json({ 
                    message: 'Accès interdit',
                    code: 'FORBIDDEN'
                });
            }
            
            const current = currentReview[0];
            
            await sql.query(
                `UPDATE avis SET 
                    note = COALESCE(?, note),
                    commentaire = COALESCE(?, commentaire),
                    updated_at = NOW()
                WHERE id = ?`,
                [rating || current.note, comment || current.commentaire, id]
            );

            const [updatedReview] = await sql.query(
                `SELECT a.id, a.movie_id, a.user_id, 
                        a.note as rating, a.commentaire as comment, 
                        a.updated_at, u.email 
                 FROM avis a
                 LEFT JOIN users u ON a.user_id = u.id
                 WHERE a.id = ?`,
                [id]
            );

            const reviewWithEmail = updatedReview[0];
            
            console.log(`[AUDIT] User ${user_id} updated review ${id}`);
            io.emit('reviewUpdated', reviewWithEmail);
            res.status(200).json(reviewWithEmail);
        } catch (error) {
            console.error('Erreur mise à jour avis:', error);
            res.status(500).json({ 
                message: 'Erreur serveur',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// DELETE: Supprimer une review
app.delete('/reviews/:id', 
    authenticateToken,
    validateReviewId,
    handleValidationErrors,
    async (req, res) => {
        const { id } = req.params;
        const user_id = req.userId;
        const userRole = req.userRole;

        try {
            const [reviewToDelete] = await sql.query(
                'SELECT * FROM avis WHERE id = ?',
                [id]
            );
            
            if (reviewToDelete.length === 0) {
                return res.status(404).json({ 
                    message: 'Avis non trouvé',
                    code: 'NOT_FOUND'
                });
            }

            // Protection IDOR - seul l'auteur ou un admin peut supprimer
            if (reviewToDelete[0].user_id !== user_id && userRole !== 'admin') {
                console.warn(`[SECURITY] Unauthorized delete attempt by user ${user_id} on review ${id}`);
                return res.status(403).json({ 
                    message: 'Accès interdit',
                    code: 'FORBIDDEN'
                });
            }
            
            await sql.query('DELETE FROM avis WHERE id = ?', [id]);
            
            console.log(`[AUDIT] ${userRole === 'admin' ? 'Admin' : 'User'} ${user_id} deleted review ${id}`);
            io.emit('reviewDeleted', { id: parseInt(id, 10) });
            
            res.status(200).json({ 
                message: 'Avis supprimé',
                code: 'SUCCESS'
            });
        } catch (error) {
            console.error('Erreur suppression avis:', error);
            res.status(500).json({ 
                message: 'Erreur serveur',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// GET: Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        service: 'reviews',
        jwt_configured: !!process.env.JWT_SECRET,
        timestamp: new Date().toISOString()
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ 
        message: 'Route non trouvée',
        code: 'NOT_FOUND'
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Erreur globale:', err.stack);
    
    const response = {
        message: 'Erreur serveur',
        code: 'SERVER_ERROR'
    };
    
    if (process.env.NODE_ENV === 'development') {
        response.details = err.message;
    }
    
    res.status(500).json(response);
});

// ========== DÉMARRAGE SERVEUR ==========
const PORT = process.env.REVIEW_SERVICE_PORT || 3003;

server.listen(PORT, () => {
    console.log(`
🚀 Review Service démarré sur: http://localhost:${PORT}
🔒 Security: Helmet, Rate Limiting, XSS Protection enabled
✓ JWT Auth: Configuré
✓ Socket.IO: Activé
    `);
});

module.exports = { app, server };