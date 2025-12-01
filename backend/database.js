// database.js - VERSION CORRECTE pour mysql2/promise
const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('🔌 Initialisation de la connexion MySQL...');

// Créez un POOL de connexions (recommandé)
const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'popcorn_view',
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test de connexion asynchrone
(async () => {
    try {
        const connection = await db.getConnection();
        console.log('✅ Connecté à MySQL - Base de données:', process.env.DB_NAME || 'popcorn_view');
        connection.release(); // Important: libérer la connexion
    } catch (err) {
        console.error('❌ Erreur de connexion à MySQL:', err.message);
    }
})();

module.exports = db;