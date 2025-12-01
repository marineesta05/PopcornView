const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config({ path: '../.env' });
const db = require('../database.js');

const app = express();

// Configuration CORS
app.use(cors({
    origin: 'http://localhost:3000', // Ajustez selon votre port frontend
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// Vérification JWT_SECRET
if (!process.env.JWT_SECRET) {
    console.error('ERREUR: JWT_SECRET non défini dans .env');
    process.exit(1);
}

const isValidEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
};

const isValidPassword = (password) => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

// REGISTER avec async/await
app.post('/register', async (req, res) => {
    const { nom, prenom, email, password, role } = req.body;

    if (!nom || !prenom || !email || !password) {
        return res.status(400).json({ message: 'Tous les champs sont requis' });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ 
            message: 'Format d\'email invalide. Exemple: exemple@mail.com' 
        });
    }

    if (!isValidPassword(password)) {
        return res.status(400).json({ 
            message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial (@$!%*?&)' 
        });
    }

    try {
        // Vérifier si l'email existe (avec await)
        const [existingUsers] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (existingUsers.length > 0) {
            return res.status(409).json({ message: 'Cet email est déjà utilisé' });
        }

        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRole = role || 'user';

        // Insérer l'utilisateur
        const [result] = await db.query(
            'INSERT INTO users (nom, prenom, email, password, role) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, email, hashedPassword, userRole]
        );

        // Générer le token
        const token = jwt.sign(
            { userId: result.insertId, role: userRole }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1h' }
        );

        res.status(201).json({ 
            message: 'Inscription réussie',
            token,
            user: {
                id: result.insertId,
                nom,
                prenom,
                email,
                role: userRole
            }
        });

    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// LOGIN avec async/await
app.post('/login', async (req, res) => {
    console.log('=== DÉBUT LOGIN ===');
    console.log('Body reçu:', req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
        console.log('Email ou password manquant');
        return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    try {
        console.log('Requête SQL pour:', email);
        
        // Récupérer l'utilisateur (avec await)
        const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        
        console.log('Résultats DB:', results);

        if (results.length === 0) {
            console.log('Utilisateur non trouvé');
            return res.status(401).json({ message: "Email ou mot de passe invalide" });
        }

        const user = results[0];
        console.log('Utilisateur trouvé:', user.email);

        // Vérifier le mot de passe
        const isPasswordValid = await bcrypt.compare(password, user.password);
        console.log('Mot de passe valide?', isPasswordValid);
        
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Email ou mot de passe invalide" });
        }

        // Générer le token
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        console.log('Token généré, envoi de la réponse...');
        
        return res.status(200).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                nom: user.nom,
                prenom: user.prenom
            }
        });

    } catch (error) {
        console.error('Erreur:', error);
        return res.status(500).json({ message: "Erreur serveur", error: error.message });
    }
});

const PORT = process.env.SERVER_PORT || 3001;

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});