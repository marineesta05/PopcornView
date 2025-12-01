const fs = require('fs');
const path = require('path');

describe('Security - Unit checks (static/exports)', () => {
  const root = path.resolve(__dirname, '..');
  const backend = path.join(root, 'backend');

  // Vérifie qu'un fichier `backend/.env` local est soit absent, soit contient les clés attendues (JWT_SECRET, TMDB_API_KEY).
  test('1) backend/.env should not contain unexpected content (allow local dev .env)', () => {
    const envPath = path.join(backend, '.env');
    if (!fs.existsSync(envPath)) {
      expect(fs.existsSync(envPath)).toBe(false);
    } else {
      const txt = fs.readFileSync(envPath, 'utf8');
      expect(/JWT_SECRET=/.test(txt)).toBe(true);
      expect(/TMDB_API_KEY=/.test(txt)).toBe(true);
    }
  });

  // Vérifie que le fichier d'exemple d'environnement `backend/.env.example` est présent.
  test('2) backend/.env.example should exist', () => {
    const p = path.join(backend, '.env.example');
    expect(fs.existsSync(p)).toBe(true);
  });

  // Vérifie que `.env.example` contient des placeholders pour les clés sensibles (éviter les secrets committés).
  test('3) .env.example uses placeholders for sensitive keys (no real JWT/TMDB keys)', () => {
    const p = path.join(backend, '.env.example');
    const content = fs.readFileSync(p, 'utf8');
    expect(/JWT_SECRET=.*replace/i.test(content)).toBe(true);
    expect(/TMDB_API_KEY=.*replace/i.test(content)).toBe(true);
  });

  // Vérifie que `fetch_tmdb.js` ne contient pas de clé API longue en dur (heuristique).
  test('4) fetch_tmdb.js does not contain an embedded long API key', () => {
    const p = path.join(backend, 'fetch_tmdb.js');
    const content = fs.readFileSync(p, 'utf8');
    const longToken = /[A-Za-z0-9_\-]{25,}/;
    expect(longToken.test(content)).toBe(false);
  });

  // Vérifie statiquement que `database.js` configure une pool de connexions (sans l'importer pour éviter d'ouvrir une connexion).
  test('5) database.js contains pool creation (static check, do not import)', () => {
    const dbPath = path.join(backend, 'database.js');
    const content = fs.readFileSync(dbPath, 'utf8');
    expect(/createPool\(|mysql2\/promise/.test(content)).toBe(true);
    expect(/module\.exports\s*=/.test(content)).toBe(true);
  });

  // Vérifie que `server.js` utilise Helmet et que les cookies sécurisés sont conditionnés à NODE_ENV=production.
  test('6) server.js uses helmet and secure cookie settings are present in code', () => {
    const p = path.join(backend, 'server.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/helmet\(\)/.test(content)).toBe(true);
    expect(/secure:\s*process\.env\.NODE_ENV\s*===\s*'production'/.test(content)).toBe(true);
  });

  // Vérifie que `server.js` implémente une vérification CSRF en comparant cookie et en-tête.
  test('7) server.js implements CSRF verification logic (cookie vs header)', () => {
    const p = path.join(backend, 'server.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/XSRF-TOKEN/.test(content)).toBe(true);
    expect(/x-csrf-token|x-xsrf-token/.test(content)).toBe(true);
    expect(/Invalid CSRF token/.test(content)).toBe(true);
  });

  // Vérifie heuristiquement que `server.js` utilise des requêtes paramétrées (présence de '?').
  test('8) server.js uses parameterized queries (contains ? placeholders)', () => {
    const p = path.join(backend, 'server.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(content.includes('?')).toBe(true);
  });

  // Vérifie que le service d'avis (`movie/serverReview.js`) utilise Helmet et un mécanisme de rate-limiting.
  test('9) movie/serverReview.js includes helmet and rate-limiting', () => {
    const p = path.join(backend, 'movie', 'serverReview.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/helmet\(/.test(content)).toBe(true);
    expect(/rateLimit\(/.test(content)).toBe(true);
  });

  // Vérifie que l'utilitaire frontend CSRF (`frontend/src/utils/csrf.js`) expose des helpers pour récupérer/attacher le token.
  test('10) frontend CSRF util file exports token helpers (static check)', () => {
    const p = path.join(root, 'frontend', 'src', 'utils', 'csrf.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/export function getCsrfToken\(\)/.test(content) || /function getCsrfToken\(\)/.test(content)).toBe(true);
    expect(/attachCsrfHeader\(/.test(content)).toBe(true);
  });
});
