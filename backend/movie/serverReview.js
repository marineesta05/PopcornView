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
const sql = require('../database');

const app = express();
const server = http.createServer(app);

// Configuration Helmet sécurisée
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
    }
}));

// CORS sécurisé
app.use(cors({
    origin: function(origin, callback) {
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'http://localhost:3000'
        ];
        
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

// Rate limiters
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de requêtes, veuillez réessayer plus tard' }
});
app.use(limiter);

const createReviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Vous avez créé trop d\'avis récemment' },
    skipSuccessfulRequests: false
});

// Configuration Socket.IO sécurisée
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Middleware d'authentification Socket.IO
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error'));
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        next();
    });
});

io.on("connection", (socket) => {
    console.log(`Client authentifié: ${socket.userId}`);

    socket.on("disconnect", () => {
        console.log("Client déconnecté:", socket.id);
    });
});

// Middleware d'authentification JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

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

// Validation des données
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
        .escape()
        .customSanitizer(value => {
            return value.replace(/[<>]/g, '');
        })
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
        .escape()
        .customSanitizer(value => {
            return value.replace(/[<>]/g, '');
        })
];

// Gestion des erreurs de validation
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

// ROUTES

// Créer un avis
app.post('/reviews', 
    authenticateToken, 
    validateReview, 
    handleValidationErrors, 
    async (req, res) => {
        const { movie_id, rating, comment } = req.body;
        const user_id = req.userId;

        try {
            // Vérifier si l'utilisateur a déjà posté un avis
            const [existingReview] = await sql.query(
                'SELECT id FROM avis WHERE movie_id = ? AND user_id = ?',
                [movie_id, user_id]
            );

            if (existingReview.length > 0) {
                return res.status(400).json({ 
                    message: 'Vous avez déjà posté un avis pour ce film',
                    code: 'DUPLICATE_REVIEW'
                });
            }

            // Insérer le nouvel avis
            const [result] = await sql.query(
                'INSERT INTO avis (movie_id, user_id, note, commentaire) VALUES (?, ?, ?, ?)',
                [movie_id, user_id, rating, comment]
            );

            // Récupérer l'avis complet avec l'email
            const [newReview] = await sql.query(
                `SELECT a.id, a.movie_id, a.user_id, a.note as rating, 
                        a.commentaire as comment, u.email 
                 FROM avis a 
                 LEFT JOIN users u ON a.user_id = u.id 
                 WHERE a.id = ?`,
                [result.insertId]
            );

            const reviewWithEmail = newReview[0];
            
            io.emit('reviewAdded', reviewWithEmail);
            
            res.status(201).json(reviewWithEmail);
        } catch (error) {
            console.error('Erreur création avis:', error);
            res.status(500).json({ 
                message: 'Erreur lors de la création de l\'avis',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Récupérer tous les avis
app.get('/reviews', async (req, res) => {
    try {
        const [result] = await sql.query(
            `SELECT a.id, a.movie_id, a.user_id, 
                   a.note as rating, a.commentaire as comment, 
                    u.email 
            FROM avis a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY rating DESC`
        );
        res.status(200).json(result);
    } catch (error) {
        console.error('Erreur récupération avis:', error);
        res.status(500).json({ 
            message: 'Erreur lors de la récupération des avis',
            code: 'SERVER_ERROR'
        });
    }
});

// Récupérer les avis d'un film
app.get('/reviews/movie/:movie_id', 
    param('movie_id').isInt({ min: 1 }).toInt(),
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
                ORDER BY rating DESC`,
                [movie_id]
            );
            res.status(200).json(result);
        } catch (error) {
            console.error('Erreur récupération avis:', error);
            res.status(500).json({ 
                message: 'Erreur lors de la récupération des avis',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Récupérer un avis spécifique
app.get('/reviews/:id',
    param('id').isInt({ min: 1 }).toInt(),
    handleValidationErrors,
    async (req, res) => {
        const { id } = req.params;
        
        try {
            const [result] = await sql.query(
                `SELECT a.id, a.movie_id, a.user_id,
                       a.note as rating, a.commentaire as comment,
                        u.email 
                FROM avis a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE a.id = ?`,
                [id]
            );
            
            if (result.length === 0) {
                return res.status(404).json({ 
                    message: 'Avis non trouvé',
                    code: 'NOT_FOUND'
                });
            }
            
            res.status(200).json(result[0]);
        } catch (error) {
            console.error('Erreur récupération avis:', error);
            res.status(500).json({ 
                message: 'Erreur lors de la récupération de l\'avis',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Modifier un avis
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

            if (currentReview[0].user_id !== user_id) {
                return res.status(403).json({ 
                    message: 'Vous ne pouvez modifier que vos propres avis',
                    code: 'FORBIDDEN'
                });
            }
            
            const current = currentReview[0];
            
            // Mise à jour avec COALESCE pour MySQL
            await sql.query(
                `UPDATE avis SET 
                    note = COALESCE(?, note),
                    commentaire = COALESCE(?, commentaire),
                    updated_at = NOW()
                WHERE id = ?`,
                [rating || current.note, comment || current.commentaire, id]
            );

            // Récupérer l'avis mis à jour avec l'email
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
            
            io.emit('reviewUpdated', reviewWithEmail);
            
            res.status(200).json(reviewWithEmail);
        } catch (error) {
            console.error('Erreur mise à jour avis:', error);
            res.status(500).json({ 
                message: 'Erreur lors de la mise à jour de l\'avis',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Supprimer un avis
app.delete('/reviews/:id', 
    authenticateToken,
    param('id').isInt({ min: 1 }).toInt(),
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

            if (reviewToDelete[0].user_id !== user_id && userRole !== 'admin') {
                return res.status(403).json({ 
                    message: 'Vous ne pouvez supprimer que vos propres avis',
                    code: 'FORBIDDEN'
                });
            }
            
            await sql.query('DELETE FROM avis WHERE id = ?', [id]);
            
            io.emit('reviewDeleted', { id: parseInt(id) });
            
            res.status(200).json({ 
                message: 'Avis supprimé avec succès',
                code: 'SUCCESS'
            });
        } catch (error) {
            console.error('Erreur suppression avis:', error);
            res.status(500).json({ 
                message: 'Erreur lors de la suppression de l\'avis',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Route 404
app.use((req, res) => {
    res.status(404).json({ 
        message: 'Route non trouvée',
        code: 'NOT_FOUND'
    });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
    console.error('Erreur globale:', err.stack);
    res.status(500).json({ 
        message: 'Erreur serveur interne',
        code: 'SERVER_ERROR'
    });
});

const PORT = process.env.REVIEW_SERVICE_PORT || 3003;
server.listen(PORT, () => {
    console.log(`Review Service sécurisé sur le port ${PORT}`);
});