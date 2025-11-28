const express = require('express');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http'); 
const { Server } = require("socket.io");
dotenv.config({ path: '../.env' });
const sql = require('../database.js');

const app = express();
const server = http.createServer(app);  

const io = new Server(server, {
    cors: { 
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true
    },
});

app.use(cors());
app.use(express.json());

io.on("connection", (socket) => {
    console.log("Client connected to WebSocket:", socket.id);

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Missing token' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });

        req.userId = user.id; // Stocker l'ID de l'utilisateur
        req.userRole = user.role; 
        next();
    });
}

// Créer un avis
app.post('/reviews', authenticateToken, async (req, res) => {
    const { movie_id, rating, comment } = req.body;
    const user_id = req.userId; // Récupérer l'ID depuis le token

    try {
        // Vérifier si l'utilisateur a déjà posté un avis pour ce film
        const existingReview = await sql`
            SELECT * FROM reviews 
            WHERE movie_id = ${movie_id} AND user_id = ${user_id}
        `;

        if (existingReview.length > 0) {
            return res.status(400).json({ message: 'Vous avez déjà posté un avis pour ce film' });
        }

        const result = await sql`
            INSERT INTO reviews (movie_id, user_id, rating, comment)
            VALUES (${movie_id}, ${user_id}, ${rating}, ${comment})
            RETURNING id, movie_id, user_id, rating, comment, created_at
        `;
        
        const review = result[0];
        
        console.log('Emitting reviewAdded with data:', review);
        io.emit('reviewAdded', review);
        res.status(201).json(review);
    } catch (error) {
        console.error('Error creating review:', error);
        res.status(400).json({ error: error.message });
    }
});

// Récupérer tous les avis
app.get('/reviews', async (req, res) => {
    try {
        console.log('Fetching all reviews...');
        const result = await sql`
            SELECT r.*, u.username 
            FROM reviews r
            LEFT JOIN users u ON r.user_id = u.id
            ORDER BY r.created_at DESC
        `;
        console.log(`Reviews fetched: ${result.length} reviews`);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(400).json({ error: error.message });
    }
});

// Récupérer les avis d'un film spécifique
app.get('/reviews/movie/:movie_id', async (req, res) => {
    const { movie_id } = req.params;
    console.log('Fetching reviews for movie ID:', movie_id);
    try {
        const result = await sql`
            SELECT r.*, u.username 
            FROM reviews r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.movie_id = ${movie_id}
            ORDER BY r.created_at DESC
        `;
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(400).json({ error: error.message });
    }
});

// Récupérer un avis spécifique
app.get('/reviews/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Fetching review with ID:', id);
    try {
        const result = await sql`
            SELECT r.*, u.username 
            FROM reviews r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.id = ${id}
        `;
        if (result.length === 0) {
            return res.status(404).json({ message: 'Review not found' });
        }
        res.status(200).json(result[0]);
    } catch (error) {
        console.error('Error fetching review:', error);
        res.status(400).json({ error: error.message });
    }
});

// Mettre à jour un avis (seulement par l'auteur)
app.put('/reviews/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const user_id = req.userId;

    try {
        const currentReview = await sql`SELECT * FROM reviews WHERE id = ${id}`;
        
        if (currentReview.length === 0) {
            return res.status(404).json({ message: 'Review not found' });
        }

        // Vérifier que l'utilisateur est l'auteur de l'avis
        if (currentReview[0].user_id !== user_id) {
            return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres avis' });
        }
        
        const current = currentReview[0];
        
        const result = await sql`
            UPDATE reviews SET 
                rating = COALESCE(${rating}::int, ${current.rating}),
                comment = COALESCE(${comment}, ${current.comment})
            WHERE id = ${id}
            RETURNING id, movie_id, user_id, rating, comment, created_at
        `;

        const updatedReview = result[0];
        console.log('Review updated, emitting reviewUpdated with data:', updatedReview);
        io.emit('reviewUpdated', updatedReview);
        res.status(200).json(updatedReview);
    } catch (error) {
        console.error('Error updating review:', error);
        res.status(400).json({ error: error.message });
    }
});

// Supprimer un avis (par l'auteur ou un admin)
app.delete('/reviews/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const user_id = req.userId;
    const userRole = req.userRole;

    try {
        const reviewToDelete = await sql`SELECT * FROM reviews WHERE id = ${id}`;
        
        if (reviewToDelete.length === 0) {
            return res.status(404).json({ message: 'Review not found' });
        }

        // Vérifier que l'utilisateur est l'auteur ou un admin
        if (reviewToDelete[0].user_id !== user_id && userRole !== 'admin') {
            return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres avis' });
        }
        
        await sql`DELETE FROM reviews WHERE id = ${id}`;
        
        console.log('Review deleted, emitting reviewDeleted with id:', id);
        io.emit('reviewDeleted', { id: parseInt(id) });
        res.status(200).json({ message: 'Review deleted successfully' });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(400).json({ error: error.message });
    }
});

server.listen(3003, () => console.log("Review Service running on port 3003"));