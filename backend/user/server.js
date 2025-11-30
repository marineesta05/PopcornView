const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config({ path: '../.env' });
const db = require('../database.js');

const app = express();
app.use(cors());
app.use(express.json());

const isValidEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
};


const isValidPassword = (password) => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

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
        const checkEmail = 'SELECT * FROM users WHERE email = ?';
        
        db.query(checkEmail, [email], async (err, results) => {
            if (err) {
                console.error('Erreur SQL:', err);
                return res.status(500).json({ message: 'Erreur serveur', error: err.message });
            }

            if (results.length > 0) {
                return res.status(409).json({ message: 'Cet email est déjà utilisé' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);

            const insertUser = 'INSERT INTO users (nom, prenom, email, password, role) VALUES (?, ?, ?, ?, ?)';
            const userRole = role || 'user';

            db.query(insertUser, [nom, prenom, email, hashedPassword, userRole], (err, result) => {
                if (err) {
                    console.error('Erreur lors de l\'insertion:', err);
                    return res.status(500).json({ message: 'Erreur lors de l\'inscription', error: err.message });
                }

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
            });
        });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});


app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email et mot de passe requis" });
    }

    const sqlQuery = "SELECT * FROM users WHERE email = ?";

    db.query(sqlQuery, [email], async (err, results) => {
        if (err) {
            console.error("Erreur SQL:", err);
            return res.status(500).json({ message: "Erreur serveur", error: err });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: "Email ou mot de passe invalide" });
        }

        const user = results[0];

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Email ou mot de passe invalide" });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                nom: user.nom,
                prenom: user.prenom
            }
        });
    });
});

const PORT = process.env.SERVER_PORT || 3001;

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});