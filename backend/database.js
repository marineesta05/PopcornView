const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('Initialisation de la connexion MySQL...');

const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error(`Variables manquantes: ${missingVars.join(', ')}`);
    process.exit(1);
}

// Config pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    
    connectTimeout: 10000,      
                
    
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

// Test de connexion avec timeout et retry
async function testConnection(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const connection = await Promise.race([
                db.getConnection(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('DB connection timeout')), 5000)
                )
            ]);
            
            console.log(`Connecté à MySQL - Base: ${process.env.DB_NAME}`);
            connection.release();
            return true;
        } catch (err) {
            console.error(`Tentative ${i + 1}/${retries} échouée:`, err.message);
            if (i === retries - 1) {
                console.error('Impossible de se connecter à MySQL après plusieurs tentatives');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

testConnection();

db.safeQuery = async function(sql, params = [], timeoutMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const [results] = await this.query(sql, params);
        clearTimeout(timeoutId);
        return results;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Query timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
};

process.on('SIGINT', async () => {
    console.log('Fermeture du pool MySQL...');
    await db.end();
    process.exit(0);
});

module.exports = db;