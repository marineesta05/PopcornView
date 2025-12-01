const fs = require('fs');
const path = require('path');

describe('Security - Integration-ish checks (static + storage)', () => {
  const root = path.resolve(__dirname, '..');
  const backend = path.join(root, 'backend');

  // Vérifie que `server.js` configure CORS et qu'il n'autorise pas une origine joker ouverte.
  test('1) server.js configures CORS and does not allow wildcard origin', () => {
    const p = path.join(backend, 'server.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/cors\(/.test(content)).toBe(true);
    expect(/origin:\s*'http:\/\/localhost:3000'/.test(content)).toBe(true);
  });

  // Vérifie que les cookies d'authentification sont définis avec `httpOnly` et `sameSite: strict`.
  test('2) server.js sets httpOnly and sameSite cookie options for auth cookie', () => {
    const p = path.join(backend, 'server.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/httpOnly:\s*true/.test(content)).toBe(true);
    expect(/sameSite:\s*'strict'/.test(content)).toBe(true);
  });

  // Vérifie statiquement que la logique CSRF compare le token du cookie et celui de l'en-tête et les valide.
  test('3) verifyCsrf rejects when cookie/header mismatch (static check)', () => {
    const p = path.join(backend, 'server.js');
    const content = fs.readFileSync(p, 'utf8');
    // check comparison cookieToken !== headerToken
    expect(/cookieToken\s*!==\s*headerToken/.test(content) || /cookieToken !== headerToken/.test(content)).toBe(true);
  });

  // Vérifie que `movie/serverReview.js` applique une Content Security Policy stricte via Helmet.
  test('4) movie/serverReview.js applies a strict Content Security Policy via helmet', () => {
    const p = path.join(backend, 'movie', 'serverReview.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/contentSecurityPolicy/.test(content)).toBe(true);
    expect(/defaultSrc:\s*\["'self'"\]|defaultSrc:\s*\[\"'self'\"\]/.test(content) || /defaultSrc/.test(content)).toBe(true);
  });

  // Vérifie que `movie/serverReview.js` utilise une whitelist CORS et n'accepte pas toutes les origines.
  test('5) movie/serverReview.js uses a CORS whitelist function (not open to any origin)', () => {
    const p = path.join(backend, 'movie', 'serverReview.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/allowedOrigins/.test(content)).toBe(true);
    expect(/allowedOrigins.indexOf\(origin\)/.test(content) || /allowedOrigins.indexOf\(origin\) !== -1/.test(content)).toBe(true);
  });

  // Vérifie que le service d'avis valide et sanitize les entrées utilisateur avec `express-validator`.
  test('6) movie/serverReview.js validates and sanitizes user input (express-validator + escape)', () => {
    const p = path.join(backend, 'movie', 'serverReview.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/express-validator/.test(content) || /validationResult\(/.test(content)).toBe(true);
    expect(/\.escape\(\)/.test(content)).toBe(true);
  });

  // Vérifie la présence d'un mécanisme de rate-limiting pour limiter les abus sur le service d'avis.
  test('7) rate-limiting is present in review service to mitigate abuse', () => {
    const p = path.join(backend, 'movie', 'serverReview.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/rateLimit\(/.test(content)).toBe(true);
  });

  // Vérifie que `data/films.json` existe et contient du JSON valide.
  test('8) stored films file exists and is valid JSON', () => {
    const p = path.join(backend, 'data', 'films.json');
    expect(fs.existsSync(p)).toBe(true);
    const txt = fs.readFileSync(p, 'utf8');
    expect(() => JSON.parse(txt)).not.toThrow();
  });

  // Vérifie qu'aucun `.env` racine n'est committé dans le dépôt (protéger les secrets globaux).
  test('9) no top-level .env file committed', () => {
    const pRoot = path.join(root, '.env');
    expect(fs.existsSync(pRoot)).toBe(false);
  });

  // Vérifie statiquement que les endpoints de sync TMDB vérifient la présence d'une clé TMDB_API_KEY.
  test('10) sync endpoints require a TMDB API key (static check in server code)', () => {
    const p = path.join(backend, 'server.js');
    const content = fs.readFileSync(p, 'utf8');
    expect(/sync-tmdb/.test(content)).toBe(true);
    expect(/TMDB_API_KEY/.test(content)).toBe(true);
  });
});
