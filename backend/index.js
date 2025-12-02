// Chargement des variables d'environnement
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Vérification et validation des secrets
const validateSecrets = () => {
  const secrets = {
    JWT_SECRET: process.env.JWT_SECRET,
    TMDB_API_KEY: process.env.TMDB_API_KEY
  };

  const MIN_JWT_SECRET_LENGTH = 32;
  
  if (!secrets.JWT_SECRET || secrets.JWT_SECRET === 'replace-me-with-secret') {
    console.error('❌ ERREUR: JWT_SECRET non configuré');
    process.exit(1);
  }

  if (secrets.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    console.error(`❌ ERREUR: JWT_SECRET trop court (${secrets.JWT_SECRET.length} < ${MIN_JWT_SECRET_LENGTH})`);
    process.exit(1);
  }

  if (!secrets.TMDB_API_KEY) {
    console.warn('⚠️  AVERTISSEMENT: TMDB_API_KEY non configuré, certaines fonctionnalités seront limitées');
  }
};
validateSecrets();

// Import node-fetch sécurisé
let fetch;
if (typeof globalThis.fetch === 'undefined') {
  try {
    fetch = require('node-fetch');
  } catch (e) {
    console.error('❌ ERREUR: node-fetch est requis. Installez-le avec: npm install node-fetch@2');
    process.exit(1);
  }
} else {
  fetch = globalThis.fetch;
}

const app = express();
const PORT = process.env.FILMS_SERVER_PORT || 4001;

// Sécurité avec Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://image.tmdb.org"]
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
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, // Limite de 100 requêtes par IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Middleware d'authentification JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      error: 'Token d\'authentification requis',
      code: 'TOKEN_MISSING'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return res.status(403).json({ 
        error: 'Token invalide ou expiré',
        code: 'TOKEN_INVALID'
      });
    }
    
    // Validation de l'utilisateur
    const userId = parseInt(user.id || user.userId);
    if (isNaN(userId) || userId <= 0) {
      return res.status(403).json({ 
        error: 'Token invalide',
        code: 'TOKEN_INVALID'
      });
    }
    
    req.user = { 
      id: userId,
      role: user.role || 'user'
    };
    next();
  });
}

// Middleware pour admin seulement
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    console.warn(`[SECURITY] Unauthorized admin access attempt by user ${req.user.id}`);
    return res.status(403).json({ 
      error: 'Accès réservé aux administrateurs',
      code: 'ADMIN_REQUIRED'
    });
  }
  next();
}

// Gestion des fichiers JSON
const DATA_PATH = path.join(__dirname, 'data', 'films.json');

async function readStoredFilms() {
  try {
    const text = await fs.readFile(DATA_PATH, 'utf8');
    const films = JSON.parse(text || '[]');
    
    // Validation basique des données
    return Array.isArray(films) ? films : [];
  } catch (e) {
    // Si le fichier n'existe pas, retourner tableau vide
    if (e.code === 'ENOENT') {
      return [];
    }
    console.error('Error reading films file:', e);
    throw new Error('Failed to read films data');
  }
}

async function writeStoredFilms(films) {
  try {
    // Validation avant écriture
    if (!Array.isArray(films)) {
      throw new Error('Films data must be an array');
    }
    
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(films, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing films file:', e);
    throw new Error('Failed to write films data');
  }
}

// Configuration sécurisée des services
const SERVICE_CONFIGS = {
  REVIEW_SERVICE: {
    hostname: process.env.REVIEW_SERVICE_HOST || 'localhost',
    port: process.env.REVIEW_SERVICE_PORT || '3003',
    path: '/reviews/movie/'
  }
};

// Fonction pour construire des URLs de service sécurisées
function buildServiceUrl(serviceName, params = {}) {
  const config = SERVICE_CONFIGS[serviceName];
  
  if (!config) {
    throw new Error(`Service ${serviceName} non configuré`);
  }
  
  // Utiliser HTTPS en production, HTTP en développement
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  
  // Validation des paramètres
  if (params.id) {
    const id = parseInt(params.id);
    if (isNaN(id) || id <= 0) {
      throw new Error('ID invalide');
    }
  }
  
  // Construire l'URL de manière sécurisée
  const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.path}`;
  
  try {
    const url = new URL(baseUrl);
    
    // Ajouter l'ID si présent
    if (params.id) {
      url.pathname += params.id;
    }
    
    return url.toString();
  } catch (error) {
    throw new Error(`URL invalide: ${error.message}`);
  }
}

// GET: Liste des films
app.get('/api/films', authenticateToken, async (req, res) => {
  try {
    const films = await readStoredFilms();
    res.json(films);
  } catch (err) {
    console.error('Error reading films:', err);
    res.status(500).json({ 
      error: 'Failed to read films',
      code: 'READ_ERROR'
    });
  }
});

// POST: Ajouter un film (admin)
app.post('/api/films', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const payload = req.body;
    
    if (!payload || !payload.id || !payload.title) {
      return res.status(400).json({ 
        error: 'Données invalides: id et title requis',
        code: 'INVALID_DATA'
      });
    }
    
    const films = await readStoredFilms();
    const exists = films.some(f => String(f.id) === String(payload.id));
    
    if (exists) {
      return res.status(409).json({ 
        error: 'Film déjà existant',
        code: 'DUPLICATE_FILM'
      });
    }
    
    // Créer le film avec validation
    const newFilm = {
      id: parseInt(payload.id),
      title: String(payload.title || ''),
      overview: String(payload.overview || ''),
      poster_path: String(payload.poster_path || ''),
      release_date: String(payload.release_date || ''),
      vote_average: parseFloat(payload.vote_average) || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (isNaN(newFilm.id) || newFilm.id <= 0) {
      return res.status(400).json({ 
        error: 'ID de film invalide',
        code: 'INVALID_ID'
      });
    }
    
    films.unshift(newFilm);
    await writeStoredFilms(films);
    
    console.log(`[AUDIT] Film ${newFilm.id} ajouté par admin ${req.user.id}`);
    res.status(201).json(newFilm);
  } catch (err) {
    console.error('Error adding film:', err);
    res.status(500).json({ 
      error: 'Failed to add film',
      code: 'ADD_ERROR'
    });
  }
});

// PUT: Modifier un film (admin)
app.put('/api/films/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const payload = req.body;
    
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ 
        error: 'ID de film invalide',
        code: 'INVALID_ID'
      });
    }
    
    const films = await readStoredFilms();
    const idx = films.findIndex(f => f.id === id);
    
    if (idx === -1) {
      return res.status(404).json({ 
        error: 'Film non trouvé',
        code: 'FILM_NOT_FOUND'
      });
    }
    
    // Mettre à jour les champs autorisés
    const allowedFields = ['title', 'overview', 'poster_path', 'release_date', 'vote_average'];
    const updatedFilm = { ...films[idx] };
    
    allowedFields.forEach(field => {
      if (payload[field] !== undefined) {
        if (field === 'vote_average') {
          updatedFilm[field] = parseFloat(payload[field]) || 0;
        } else {
          updatedFilm[field] = String(payload[field] || '');
        }
      }
    });
    
    updatedFilm.updated_at = new Date().toISOString();
    films[idx] = updatedFilm;
    
    await writeStoredFilms(films);
    
    console.log(`[AUDIT] Film ${id} modifié par admin ${req.user.id}`);
    res.json(updatedFilm);
  } catch (err) {
    console.error('Error updating film:', err);
    res.status(500).json({ 
      error: 'Failed to update film',
      code: 'UPDATE_ERROR'
    });
  }
});

// DELETE: Supprimer un film (admin)
app.delete('/api/films/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ 
        error: 'ID de film invalide',
        code: 'INVALID_ID'
      });
    }
    
    const films = await readStoredFilms();
    const newFilms = films.filter(f => f.id !== id);
    
    if (newFilms.length === films.length) {
      return res.status(404).json({ 
        error: 'Film non trouvé',
        code: 'FILM_NOT_FOUND'
      });
    }
    
    await writeStoredFilms(newFilms);
    
    console.log(`[AUDIT] Film ${id} supprimé par admin ${req.user.id}`);
    res.json({ 
      success: true, 
      message: 'Film supprimé',
      deleted_id: id
    });
  } catch (err) {
    console.error('Error deleting film:', err);
    res.status(500).json({ 
      error: 'Failed to delete film',
      code: 'DELETE_ERROR'
    });
  }
});

// GET: Récupérer les reviews d'un film
app.get('/api/movies/:id/reviews', authenticateToken, async (req, res) => {
  try {
    const filmId = parseInt(req.params.id);
    
    if (isNaN(filmId) || filmId <= 0) {
      return res.status(400).json({ 
        error: 'ID de film invalide',
        code: 'INVALID_MOVIE_ID'
      });
    }

    // Construire l'URL de manière sécurisée
    let reviewsUrl;
    try {
      reviewsUrl = buildServiceUrl('REVIEW_SERVICE', { id: filmId });
    } catch (error) {
      console.error('Erreur construction URL:', error);
      return res.status(400).json({ 
        error: 'Configuration de service invalide',
        code: 'SERVICE_CONFIG_ERROR'
      });
    }

    // Validation de l'URL
    let parsedUrl;
    try {
      parsedUrl = new URL(reviewsUrl);
      
      // Vérifier le protocole
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Protocole non autorisé');
      }
      
      // Vérifier le domaine en production
      if (process.env.NODE_ENV === 'production') {
        const allowedDomains = [
          SERVICE_CONFIGS.REVIEW_SERVICE.hostname,
          process.env.REVIEW_SERVICE_DOMAIN
        ].filter(Boolean);
        
        if (allowedDomains.length > 0 && !allowedDomains.includes(parsedUrl.hostname)) {
          throw new Error('Domaine non autorisé');
        }
      }
    } catch (error) {
      console.error('Erreur validation URL:', error);
      return res.status(400).json({ 
        error: 'URL de service invalide',
        code: 'INVALID_SERVICE_URL'
      });
    }

    // Requête avec timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const reviewsResponse = await fetch(reviewsUrl, {
        headers: {
          'Authorization': req.headers['authorization'] || '',
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!reviewsResponse.ok) {
        const status = reviewsResponse.status;
        console.error(`Service review error (${status}) for film ${filmId}`);
        
        if (status === 404) {
          return res.status(404).json({ 
            error: 'Aucune review trouvée pour ce film',
            code: 'NO_REVIEWS_FOUND'
          });
        }
        
        return res.status(502).json({ 
          error: 'Service de reviews indisponible',
          code: 'REVIEW_SERVICE_UNAVAILABLE'
        });
      }
      
      const data = await reviewsResponse.json();
      res.status(200).json(data);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('Timeout du service review pour film', filmId);
        return res.status(504).json({ 
          error: 'Service de reviews non disponible (timeout)',
          code: 'SERVICE_TIMEOUT'
        });
      }
      
      console.error('Erreur fetch:', fetchError);
      return res.status(502).json({ 
        error: 'Impossible de joindre le service de reviews',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    
  } catch (error) {
    console.error('Erreur inattendue:', error);
    res.status(500).json({ 
      error: 'Erreur serveur interne',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET: Films populaires TMDB
app.get('/api/tmdb/popular', authenticateToken, async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    
    if (!apiKey) {
      return res.status(503).json({ 
        error: 'Service TMDB non configuré',
        code: 'TMDB_NOT_CONFIGURED'
      });
    }
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=fr-FR&page=${page}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
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
      total_pages: Math.min(data.total_pages || 1, 500),
      total_results: data.total_results,
      results
    });
  } catch (err) {
    console.error('TMDB popular error:', err);
    
    if (err.name === 'AbortError') {
      return res.status(504).json({ 
        error: 'TMDB API timeout',
        code: 'TMDB_TIMEOUT'
      });
    }
    
    res.status(502).json({ 
      error: 'Failed to fetch popular movies from TMDB',
      code: 'TMDB_UNAVAILABLE'
    });
  }
});

// GET: Recherche TMDB
app.get('/api/tmdb/search', authenticateToken, async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    
    if (!apiKey) {
      return res.status(503).json({ 
        error: 'Service TMDB non configuré',
        code: 'TMDB_NOT_CONFIGURED'
      });
    }
    
    const query = String(req.query.q || req.query.query || '').trim();
    
    if (!query || query.length < 2) {
      return res.status(400).json({ 
        error: 'Query parameter required (minimum 2 caractères)',
        code: 'QUERY_TOO_SHORT'
      });
    }
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=fr-FR&page=${page}&query=${encodedQuery}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
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
      total_pages: data.total_pages || 1,
      total_results: data.total_results,
      results
    });
  } catch (err) {
    console.error('TMDB search error:', err);
    
    if (err.name === 'AbortError') {
      return res.status(504).json({ 
        error: 'TMDB API timeout',
        code: 'TMDB_TIMEOUT'
      });
    }
    
    res.status(502).json({ 
      error: 'Failed to search movies on TMDB',
      code: 'TMDB_UNAVAILABLE'
    });
  }
});

// POST: Synchroniser TMDB (admin)
app.post('/api/sync-tmdb', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    
    if (!apiKey) {
      return res.status(503).json({ 
        error: 'TMDB_API_KEY non configuré',
        code: 'TMDB_NOT_CONFIGURED'
      });
    }
    
    const maxPages = 5; // Limité pour éviter les abus
    const movies = [];
    
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=fr-FR&page=${page}`;
      
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          console.warn(`TMDB API error on page ${page}: ${response.status}`);
          break;
        }
        
        const data = await response.json();
        
        if (Array.isArray(data.results)) {
          data.results.forEach(m => {
            movies.push({
              id: m.id,
              title: m.title,
              overview: m.overview,
              poster_path: m.poster_path,
              release_date: m.release_date,
              vote_average: m.vote_average
            });
          });
        }
        
        // Délai pour ne pas surcharger l'API
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (pageError) {
        console.error(`Error fetching page ${page}:`, pageError);
        break;
      }
    }
    
    console.log(`[AUDIT] TMDB sync by admin ${req.user.id}: ${movies.length} films récupérés`);
    
    res.json({ 
      success: true,
      count: movies.length, 
      results: movies.slice(0, 100) // Limiter la réponse
    });
  } catch (err) {
    console.error('TMDB sync error:', err);
    res.status(500).json({ 
      error: 'Failed to sync TMDB movies',
      code: 'SYNC_ERROR'
    });
  }
});

// GET: Documentation
app.get('/', (req, res) => {
  res.json({
    name: 'PopcornView Films API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    documentation: {
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
      reviews: 'GET /api/movies/:id/reviews',
      health: 'GET /api/health'
    }
  });
});

// GET: Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'films',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    tmdb_configured: !!process.env.TMDB_API_KEY,
    data_file: {
      path: DATA_PATH,
      exists: require('fs').existsSync(DATA_PATH)
    }
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route non trouvée',
    code: 'NOT_FOUND'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  const response = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  };
  
  if (process.env.NODE_ENV === 'development') {
    response.message = err.message;
    response.stack = err.stack;
  }
  
  res.status(500).json(response);
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`
🚀 Films API démarrée sur: http://localhost:${PORT}
📁 Environnement: ${process.env.NODE_ENV || 'development'}
🔐 JWT Auth: ${process.env.JWT_SECRET ? '✓ Configuré' : '✗ Manquant'}
🎬 TMDB API: ${process.env.TMDB_API_KEY ? '✓ Configuré' : '✗ Manquant'}
💾 Fichier de données: ${DATA_PATH}
  
📚 Documentation: http://localhost:${PORT}
🏥 Health check: http://localhost:${PORT}/api/health
  `);
});

module.exports = app;