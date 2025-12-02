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
            imgSrc: ["'self'", "data:", "https:"],
            frameAncestors: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
    ieNoOpen: true,
    dnsPrefetchControl: { allow: false }
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
            console.warn(`[SECURITY] CORS blocked from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ========== MIDDLEWARE DÉTECTION PAYLOADS MALVEILLANTS ==========
const detectMaliciousPayloads = (req, res, next) => {
    const bodyString = JSON.stringify(req.body);
    
    // Détecter les tentatives d'injection (patterns optimisés)
    const maliciousPatterns = [
        /<script[^>]*>/i,
        /javascript:/i,
        /vbscript:/i,
        /data:text\/html/i,
        /on\w+\s*=/i,
        /eval\s*\(/i,
        /document\.(cookie|write)/i,
        /window\.(location|alert|prompt|confirm)/i,
        /alert\s*\(/i,
        /prompt\s*\(/i,
        /confirm\s*\(/i,
        /(\?|&)([^=]+)=([^&]*)/ // Détection de paramètres d'URL dans le body
    ];
    
    for (const pattern of maliciousPatterns) {
        if (pattern.test(bodyString)) {
            console.warn(`[SECURITY] Malicious payload detected from IP: ${req.ip}`);
            return res.status(400).json({
                message: 'Requête rejetée pour des raisons de sécurité',
                code: 'SECURITY_REJECTION'
            });
        }
    }
    
    next();
};

// ========== RATE LIMITING ==========
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de requêtes, réessayez plus tard' },
    skip: (req) => req.ip === '127.0.0.1' // Skip pour localhost en développement
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
    pingInterval: 25000,
    transports: ['websocket', 'polling'], // Préférer WebSocket
    allowEIO3: false // Désactiver l'ancien protocole
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        console.warn('[SECURITY] Socket connection attempt without token');
        return next(new Error('Authentication error'));
    }
    
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.warn('[SECURITY] Invalid socket auth attempt:', err.message);
            return next(new Error('Authentication error'));
        }
        socket.userId = decoded.id || decoded.userId;
        socket.userRole = decoded.role;
        socket.join(`user:${socket.userId}`); // Room par utilisateur
        next();
    });
});

io.on("connection", (socket) => {
    console.log(`✓ Client authentifié: ${socket.userId}`);
    
    socket.on("disconnect", (reason) => {
        console.log(`✓ Client déconnecté: ${socket.id}, raison: ${reason}`);
    });
    
    socket.on("error", (err) => {
        console.error(`Socket error for user ${socket.userId}:`, err.message);
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

// ========== SANITIZATION SÉCURISÉE ==========
function sanitizeHtml(text, maxLength = 10000) {
    if (typeof text !== 'string') {
        return '';
    }
    
    // Tronquer d'abord pour limiter le traitement
    let sanitized = text.substring(0, maxLength);
    
    // Patterns optimisés pour éviter ReDoS
    // Utiliser des quantificateurs non-greedy et limiter la complexité
    const dangerousPatterns = [
        // Scripts - pattern optimisé
        /<script\b[^<]*>[\s\S]{0,1000}?<\/script>/gi,
        
        // Iframes et objects - pattern optimisé
        /<iframe\b[^<]*>[\s\S]{0,1000}?<\/iframe>/gi,
        /<object\b[^<]*>[\s\S]{0,1000}?<\/object>/gi,
        
        // Autres éléments dangereux
        /<\s*(?:embed|link|style|meta)\b[^>]*>/gi,
        
        // Événements inline - pattern plus strict
        /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^>\s]+)/gi,
        
        // Protocoles dangereux
        /\b(?:javascript|vbscript|data):[^\s>]*/gi,
        
        // Expressions de style dangereuses
        /expression\s*\([^)]*\)/gi
    ];
    
    // Appliquer les patterns avec une limite de temps
    const startTime = Date.now();
    const MAX_PROCESSING_TIME = 100; // 100ms max
    
    for (const pattern of dangerousPatterns) {
        // Vérifier le temps d'exécution
        if (Date.now() - startTime > MAX_PROCESSING_TIME) {
            console.warn('[SECURITY] Sanitization timeout');
            sanitized = '';
            break;
        }
        
        try {
            sanitized = sanitized.replace(pattern, '');
        } catch (error) {
            console.warn('[SECURITY] Regex error during sanitization:', error.message);
            sanitized = '';
            break;
        }
    }
    
    // Si timeout ou erreur, retourner chaîne vide
    if (sanitized === '') return '';
    
    // Supprimer toutes les balises HTML restantes (pattern simple et rapide)
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Encoder les entités HTML (méthode directe pour éviter ReDoS)
    const replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#96;'
    };
    
    sanitized = sanitized.replace(/[&<>"'/`]/g, (match) => replacements[match] || match);
    
    // Normaliser les espaces (avec limite)
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
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
}

// ========== ROUTES SÉCURISÉES ==========

// POST: Créer une review
app.post('/reviews', 
    detectMaliciousPayloads,
    authenticateToken, 
    createReviewLimiter,
    validateReview, 
    handleValidationErrors, 
    async (req, res) => {
        const { movie_id, rating, comment } = req.body;
        const user_id = req.userId;

        try {
            // Vérifier que le film existe
            const [movieExists] = await sql.query(
                'SELECT id FROM movies WHERE id = ?',
                [movie_id]
            );
            
            if (movieExists.length === 0) {
                return res.status(404).json({ 
                    message: 'Film non trouvé',
                    code: 'MOVIE_NOT_FOUND'
                });
            }

            // Vérifier la duplication
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

            // Insérer la review
            const [result] = await sql.query(
                'INSERT INTO avis (movie_id, user_id, note, commentaire) VALUES (?, ?, ?, ?)',
                [movie_id, user_id, rating, comment]
            );

            // Récupérer la review avec les infos utilisateur
            const [newReview] = await sql.query(
                `SELECT a.id, a.movie_id, a.user_id, a.note as rating, 
                        a.commentaire as comment, a.created_at,
                        u.email, u.username 
                 FROM avis a 
                 LEFT JOIN users u ON a.user_id = u.id 
                 WHERE a.id = ?`,
                [result.insertId]
            );

            const reviewWithDetails = newReview[0];
            
            console.log(`[AUDIT] User ${user_id} created review ${result.insertId} for movie ${movie_id}`);
            
            // Émettre aux rooms concernées
            io.to(`user:${user_id}`).emit('reviewAdded', reviewWithDetails);
            io.emit('newReview', reviewWithDetails);
            
            res.status(201).json(reviewWithDetails);
        } catch (error) {
            console.error('Erreur création avis:', error);
            
            // Gérer les erreurs SQL spécifiques
            if (error.code === 'ER_NO_REFERENCED_ROW_2') {
                return res.status(400).json({ 
                    message: 'Film ou utilisateur invalide',
                    code: 'INVALID_REFERENCE'
                });
            }
            
            res.status(500).json({ 
                message: 'Erreur serveur',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// GET: Toutes les reviews (pagination recommandée)
app.get('/reviews', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        
        // Récupérer les reviews avec pagination
        const [result] = await sql.query(
            `SELECT a.id, a.movie_id, a.user_id, 
                   a.note as rating, a.commentaire as comment, 
                   a.created_at, u.email, u.username 
            FROM avis a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        
        // Compter le total
        const [countResult] = await sql.query('SELECT COUNT(*) as total FROM avis');
        const total = countResult[0].total;
        
        res.status(200).json({
            reviews: result,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
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
            // Vérifier que le film existe
            const [movieExists] = await sql.query(
                'SELECT id FROM movies WHERE id = ?',
                [movie_id]
            );
            
            if (movieExists.length === 0) {
                return res.status(404).json({ 
                    message: 'Film non trouvé',
                    code: 'MOVIE_NOT_FOUND'
                });
            }
            
            const [result] = await sql.query(
                `SELECT a.id, a.movie_id, a.user_id,
                       a.note as rating, a.commentaire as comment,
                       a.created_at, u.email, u.username 
                FROM avis a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE a.movie_id = ?
                ORDER BY a.created_at DESC`,
                [movie_id]
            );
            
            // Calculer la moyenne
            const [stats] = await sql.query(
                `SELECT AVG(note) as average_rating, COUNT(*) as total_reviews 
                 FROM avis WHERE movie_id = ?`,
                [movie_id]
            );
            
            res.status(200).json({
                reviews: result,
                stats: stats[0]
            });
        } catch (error) {
            console.error('Erreur récupération avis:', error);
            res.status(500).json({ 
                message: 'Erreur serveur',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// GET: Reviews d'un utilisateur
app.get('/reviews/user/:user_id',
    authenticateToken,
    param('user_id').isInt({ min: 1 }).toInt(),
    handleValidationErrors,
    async (req, res) => {
        const { user_id } = req.params;
        const currentUserId = req.userId;
        
        // Un utilisateur ne peut voir que ses propres reviews
        if (parseInt(user_id) !== currentUserId && req.userRole !== 'admin') {
            return res.status(403).json({
                message: 'Accès interdit',
                code: 'FORBIDDEN'
            });
        }
        
        try {
            const [result] = await sql.query(
                `SELECT a.id, a.movie_id, a.note as rating, 
                        a.commentaire as comment, a.created_at,
                        m.title as movie_title
                 FROM avis a
                 LEFT JOIN movies m ON a.movie_id = m.id
                 WHERE a.user_id = ?
                 ORDER BY a.created_at DESC`,
                [user_id]
            );
            
            res.status(200).json(result);
        } catch (error) {
            console.error('Erreur récupération avis utilisateur:', error);
            res.status(500).json({
                message: 'Erreur serveur',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// PUT: Modifier une review
app.put('/reviews/:id', 
    detectMaliciousPayloads,
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

            // Protection IDOR stricte
            if (currentReview[0].user_id !== user_id && req.userRole !== 'admin') {
                console.warn(`[SECURITY] IDOR attempt: User ${user_id} tried to modify review ${id}`);
                return res.status(403).json({ 
                    message: 'Accès interdit',
                    code: 'FORBIDDEN'
                });
            }
            
            const current = currentReview[0];
            const finalRating = rating !== undefined ? rating : current.note;
            const finalComment = comment !== undefined ? comment : current.commentaire;
            
            // Mise à jour avec timestamp
            await sql.query(
                `UPDATE avis SET 
                    note = ?,
                    commentaire = ?,
                    updated_at = NOW()
                WHERE id = ?`,
                [finalRating, finalComment, id]
            );

            // Récupérer la review mise à jour
            const [updatedReview] = await sql.query(
                `SELECT a.id, a.movie_id, a.user_id, 
                        a.note as rating, a.commentaire as comment, 
                        a.created_at, a.updated_at,
                        u.email, u.username 
                 FROM avis a
                 LEFT JOIN users u ON a.user_id = u.id
                 WHERE a.id = ?`,
                [id]
            );

            const reviewWithDetails = updatedReview[0];
            
            console.log(`[AUDIT] User ${user_id} updated review ${id}`);
            
            // Émettre l'update
            io.emit('reviewUpdated', reviewWithDetails);
            io.to(`user:${user_id}`).emit('myReviewUpdated', reviewWithDetails);
            
            res.status(200).json(reviewWithDetails);
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
            
            // Log avant suppression
            console.log(`[AUDIT] Deleting review ${id} by ${userRole === 'admin' ? 'admin' : 'user'} ${user_id}`);
            
            await sql.query('DELETE FROM avis WHERE id = ?', [id]);
            
            // Émettre la suppression
            io.emit('reviewDeleted', { 
                id: parseInt(id, 10),
                deletedBy: user_id,
                timestamp: new Date().toISOString()
            });
            
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

// GET: Health check complet
app.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        service: 'reviews',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        jwt_configured: !!process.env.JWT_SECRET,
        database: 'unknown',
        memory: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
        }
    };
    
    // Tester la connexion DB
    try {
        const [result] = await sql.query('SELECT 1 as test');
        health.database = result[0].test === 1 ? 'connected' : 'error';
    } catch (error) {
        health.database = 'disconnected';
        health.status = 'degraded';
    }
    
    res.json(health);
});

// GET: Métriques pour monitoring
app.get('/metrics', authenticateToken, (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({
            message: 'Accès réservé aux administrateurs',
            code: 'FORBIDDEN'
        });
    }
    
    const metrics = {
        connections: io.engine.clientsCount,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    };
    
    res.json(metrics);
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ 
        message: 'Route non trouvée',
        code: 'NOT_FOUND',
        path: req.path
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    const errorMessage = process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'Internal server error';
    
    console.error('Erreur globale:', errorMessage);
    
    const response = {
        message: 'Erreur serveur',
        code: 'SERVER_ERROR'
    };
    
    if (process.env.NODE_ENV === 'development') {
        response.details = err.message;
        response.stack = err.stack;
    }
    
    res.status(500).json(response);
});

// ========== DÉMARRAGE SERVEUR ==========
const PORT = process.env.REVIEW_SERVICE_PORT || 3003;

server.listen(PORT, () => {
    console.log(`
Review Service démarré sur: http://localhost:${PORT}
    
 Configuration:
   - Port: ${PORT}
   - Environment: ${process.env.NODE_ENV || 'development'}
   - CORS Origins: ${allowedOrigins.join(', ')}
    
 Sécurité:
   ✓ Helmet (CSP, HSTS, XSS Filter)
   ✓ Rate Limiting (général et création d'avis)
   ✓ JWT Authentication
   ✓ Sanitization anti-XSS/ReDoS
   ✓ IDOR Protection
   ✓ Malicious Payload Detection
    
📡 Services:
   ✓ Socket.IO avec auth
   ✓ Base de données
   ✓ Health Check
   ✓ Metrics (admin)
    
📈 Monitoring:
   - Health: http://localhost:${PORT}/health
   - Metrics: http://localhost:${PORT}/metrics (admin)
    `);
});

module.exports = { app, server, io };