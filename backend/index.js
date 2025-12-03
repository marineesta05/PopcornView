// Chargement des variables d'environnement
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');

// Import node-fetch si nécessaire
let fetch;
try {
  if (typeof globalThis.fetch === 'undefined') {
    fetch = require('node-fetch');
  } else {
    fetch = globalThis.fetch;
  }
} catch (e) {
  console.warn('Warning: node-fetch not available. Install with: npm install node-fetch@2');
}

const app = express();
app.disable('x-powered-by');
const PORT = process.env.FILMS_SERVER_PORT || 4001;


app.use(cors({ 
  origin: ['http://localhost:3000', 'http://localhost:3001'], 
  credentials: true 
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));



function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Token d\'authentification requis' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    
    req.user = user;
    next();
  });
}

// Middleware pour vérifier le rôle admin
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

// ========================================
// HELPERS - Gestion fichier films.json
// ========================================

const DATA_PATH = path.join(__dirname, 'data', 'films.json');

async function readStoredFilms() {
  try {
    const text = await fs.readFile(DATA_PATH, 'utf8');
    return JSON.parse(text || '[]');
  } catch (e) {
    return [];
  }
}

async function writeStoredFilms(arr) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(arr, null, 2), 'utf8');
}

// ========================================
// ROUTES FILMS (CRUD) - PROTÉGÉES
// ========================================

// GET tous les films (accessible à tous les utilisateurs authentifiés)
app.get('/api/films', authenticateToken, async (req, res) => {
  try {
    const films = await readStoredFilms();
    res.json(films);
  } catch (err) {
    console.error('Error reading films:', err);
    res.status(500).json({ error: 'Failed to read films' });
  }
});

// POST ajouter un film (admin seulement)
app.post('/api/films', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const payload = req.body;
    
    if (!payload || !payload.id) {
      return res.status(400).json({ error: 'Invalid payload, must include id' });
    }
    
    const films = await readStoredFilms();
    
    // Vérifier si le film existe déjà
    const exists = films.find(f => 
      String(f.id) === String(payload.id) || 
      String(f._id) === String(payload._id)
    );
    
    if (exists) {
      return res.status(409).json({ error: 'Film already exists' });
    }
    
    // Créer le nouveau film
    const newFilm = {
      _id: String(payload.id),
      id: payload.id,
      title: payload.title,
      overview: payload.overview,
      poster_path: payload.poster_path,
      release_date: payload.release_date,
      vote_average: payload.vote_average
    };
    
    films.unshift(newFilm);
    await writeStoredFilms(films);
    
    res.status(201).json(newFilm);
  } catch (err) {
    console.error('Error adding film:', err);
    res.status(500).json({ error: 'Failed to add film' });
  }
});

// PUT modifier un film (admin seulement)
app.put('/api/films/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const payload = req.body;
    
    const films = await readStoredFilms();
    const idx = films.findIndex(f => 
      String(f._id) === id || String(f.id) === id
    );
    
    if (idx === -1) {
      return res.status(404).json({ error: 'Film not found' });
    }
    
    films[idx] = { ...films[idx], ...payload };
    await writeStoredFilms(films);
    
    res.json(films[idx]);
  } catch (err) {
    console.error('Error updating film:', err);
    res.status(500).json({ error: 'Failed to update film' });
  }
});

// DELETE supprimer un film (admin seulement)
app.delete('/api/films/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    
    const films = await readStoredFilms();
    const newFilms = films.filter(f => 
      !(String(f._id) === id || String(f.id) === id)
    );
    
    if (newFilms.length === films.length) {
      return res.status(404).json({ error: 'Film not found' });
    }
    
    await writeStoredFilms(newFilms);
    res.json({ success: true, message: 'Film deleted' });
  } catch (err) {
    console.error('Error deleting film:', err);
    res.status(500).json({ error: 'Failed to delete film' });
  }
});

// ========================================
// ROUTES MANQUANTES POUR MOVIE DETAIL
// ========================================

// GET détails d'un film spécifique
  app.get('/api/movies/:id', authenticateToken, async (req, res) => {
    try {
      const filmId = parseInt(req.params.id);
      
      if (isNaN(filmId)) {
        return res.status(400).json({ error: 'Invalid movie ID' });
      }

      // D'abord chercher dans les films stockés
      const storedFilms = await readStoredFilms();
      const storedFilm = storedFilms.find(f => 
        parseInt(f.id) === filmId || parseInt(f._id) === filmId
      );

      if (storedFilm) {
        return res.json({
          id: storedFilm.id,
          title: storedFilm.title,
          description: storedFilm.overview,
          poster: storedFilm.poster_path ? `https://image.tmdb.org/t/p/w500${storedFilm.poster_path}` : null,
          genre: storedFilm.genre || 'Non spécifié',
          duration: storedFilm.duration || 120,
          release_date: storedFilm.release_date,
          vote_average: storedFilm.vote_average
        });
      }

    // Si pas trouvé localement, chercher dans TMDB
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      return res.status(404).json({ error: 'Film non trouvé' });
    }

    const url = `https://api.themoviedb.org/3/movie/${filmId}?api_key=${apiKey}&language=fr-FR`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).json({ error: 'Film non trouvé' });
    }

    const movieData = await response.json();
    
    const movie = {
      id: movieData.id,
      title: movieData.title,
      description: movieData.overview,
      poster: movieData.poster_path ? `https://image.tmdb.org/t/p/w500${movieData.poster_path}` : null,
      genre: movieData.genres && movieData.genres.length > 0 ? movieData.genres.map(g => g.name).join(', ') : 'Non spécifié',
      duration: movieData.runtime || 120,
      release_date: movieData.release_date,
      vote_average: movieData.vote_average
    };

    res.json(movie);
  } catch (err) {
    console.error('Error fetching movie details:', err);
    res.status(500).json({ error: 'Failed to fetch movie details' });
  }
});

// GET reviews d'un film (proxy vers le service reviews sur le port 3003)
app.get('/api/movies/:id/reviews', authenticateToken, async (req, res) => {
  try {
    const filmId = parseInt(req.params.id);
    
    if (isNaN(filmId)) {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }

    // Faire une requête au service reviews sur le port 3003
    const reviewsUrl = `http://localhost:3003/reviews/movie/${filmId}`;
    const reviewsResponse = await fetch(reviewsUrl, {
      headers: {
        'Authorization': req.headers['authorization'] || ''
      }
    });

    if (!reviewsResponse.ok) {
      throw new Error(`Reviews service error: ${reviewsResponse.status}`);
    }

    const reviews = await reviewsResponse.json();
    
    // Formater les reviews pour le frontend
    const formattedReviews = reviews.map(review => ({
      id: review.id,
      author: review.email || `User${review.user_id}`,
      rating: review.rating,
      comment: review.comment,
      created_at: review.created_at
    }));

    res.json(formattedReviews);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});


app.get('/api/tmdb/popular', authenticateToken, async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'TMDB_API_KEY not configured on server' 
      });
    }
    
    const page = Number(req.query.page || 1);
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=fr-FR&page=${page}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const results = (data.results || []).map(m => ({
      id: m.id,
      title: m.title,
      overview: m.overview,
      poster_path: m.poster_path,
      release_date: m.release_date,
      vote_average: m.vote_average
    }));
    
    res.json({
      page: data.page,
      total_pages: data.total_pages,
      results
    });
  } catch (err) {
    console.error('TMDB popular error:', err);
    res.status(500).json({ error: 'Failed to fetch popular movies' });
  }
});

// GET recherche films TMDB (accessible à tous)
app.get('/api/tmdb/search', authenticateToken, async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'TMDB_API_KEY not configured on server' 
      });
    }
    
    const query = String(req.query.q || req.query.query || '').trim();
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Query parameter required (q or query)' 
      });
    }
    
    const page = Number(req.query.page || 1);
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=fr-FR&page=${page}&query=${encodeURIComponent(query)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const results = (data.results || []).map(m => ({
      id: m.id,
      title: m.title,
      overview: m.overview,
      poster_path: m.poster_path,
      release_date: m.release_date,
      vote_average: m.vote_average
    }));
    
    res.json({
      page: data.page,
      total_pages: data.total_pages,
      results
    });
  } catch (err) {
    console.error('TMDB search error:', err);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

// POST synchroniser films populaires TMDB (admin seulement)
app.post('/api/sync-tmdb', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'TMDB_API_KEY not configured' });
    }
    
    const movies = [];
    const maxPages = 10;
    
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=fr-FR&page=${page}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`TMDB API error on page ${page}`);
      }
      
      const data = await response.json();
      
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
      
      // Petit délai pour ne pas surcharger l'API
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    res.json({ 
      count: movies.length, 
      results: movies.slice(0, 200) 
    });
  } catch (err) {
    console.error('TMDB sync error:', err);
    res.status(500).json({ error: 'Failed to sync TMDB movies' });
  }
});



app.get('/', (req, res) => {
  res.json({
    name: 'PopcornView Films API',
    version: '1.0.0',
    endpoints: {
      films: {
        list: 'GET /api/films',
        add: 'POST /api/films',
        update: 'PUT /api/films/:id',
        delete: 'DELETE /api/films/:id'
      },
      tmdb: {
        popular: 'GET /api/tmdb/popular?page=1',
        search: 'GET /api/tmdb/search?q=query&page=1',
        sync: 'POST /api/sync-tmdb'
      },
      health: 'GET /api/health'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'films',
    tmdb_configured: !!process.env.TMDB_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Route 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});


app.listen(PORT, () => {
  
  console.log(`✅ Server running on: http://localhost:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ TMDB API Key: ${process.env.TMDB_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`✅ JWT Auth: ${process.env.JWT_SECRET ? '✓ Configured' : '✗ Missing'}`);
  console.log(`✅ Data file: ${DATA_PATH}\n`);
  console.log('📚 Documentation: http://localhost:' + PORT);
  console.log('🏥 Health check: http://localhost:' + PORT + '/api/health\n');
});

module.exports = app;