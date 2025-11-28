const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'popcorn_view',
    port: Number(process.env.DB_PORT || 3306)
});

db.connect((err) => {
    if (err) {
        console.error('Erreur de connexion à MySQL:', err);
        return;
    }
    console.log('Connecté à MySQL - Base de données: popcorn_view');
});

module.exports = db;