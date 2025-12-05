# PopcornView - Application Web Sécurisée

> Application de gestion de films avec authentification robuste et conformité RGPD

Guide d'installation et d'exécution pour les contributeurs qui clonent le dépôt.

---

## 📋 Table des matières

- [Prérequis](#-prérequis)
- [Structure du projet](#-structure-du-projet)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Base de données](#-base-de-données)
- [Lancement de l'application](#-lancement-de-lapplication)
- [Tests](#-tests)
- [Sécurité et bonnes pratiques](#-sécurité-et-bonnes-pratiques)
- [Dépannage](#-dépannage)
- [Licence](#-licence)

---

## 🔧 Prérequis

### Logiciels requis

| Logiciel | Version minimale | Téléchargement |
|----------|------------------|----------------|
| **Node.js** | v16.0.0+ (v18+ recommandé) | [nodejs.org](https://nodejs.org/fr) |
| **npm** | v9.0.0+ | Inclus avec Node.js |
| **MySQL** | v8.0.44+ | [MySQL Installer](https://dev.mysql.com/downloads/installer/) |
| **Git** | v2.x+ | [git-scm.com](https://git-scm.com/downloads) |

### Vérification des installations

#### 🪟 Windows (PowerShell)

```powershell
# Vérifier Node.js
node --version
# Attendu : v18.0.0 ou supérieur

# Vérifier npm
npm --version
# Attendu : 9.0.0 ou supérieur

# Vérifier MySQL
mysql --version
# Attendu : mysql Ver 8.0.x

# Vérifier Git
git --version
# Attendu : git version 2.x.x
```

#### 🍎 macOS/Linux (Terminal)

```bash
# Vérifier Node.js
node --version
# Attendu : v18.0.0 ou supérieur

# Vérifier npm
npm --version
# Attendu : 9.0.0 ou supérieur

# Vérifier MySQL
mysql --version
# Attendu : mysql Ver 8.0.x

# Vérifier Git
git --version
# Attendu : git version 2.x.x
```

---

## 📁 Structure du projet

```
popcorn-view/
├── backend/
│   ├── server.js                # Serveur principal (port 4000)
│   ├── index.js                 # Serveur pour la gestion des films (port 4001)
│   ├── database.js              # Configuration MySQL avec timeouts
│   ├── .env                     # Variables d'environnement (NON COMMITÉ)
│   ├── .env.example             # Template de configuration
│   ├── package.json             # Dépendances backend
│   ├── start-all.bat            # Script de lancement Windows
│   ├── start-all.sh             # Script de lancement macOS/Linux
│   ├── data/
│   │   └── films.json           # Stockage des films
│   ├── user/
│   │   └── server.js            # Service auth (port 3001)
│   └── movie/
│       └── serverReview.js      # Service reviews (port 3003)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   │   ├── register.jsx # Inscription sécurisée
│   │   │   │   └── login.jsx    # Connexion sécurisée
│   │   │   ├── home.jsx         # Catalogue films
│   │   │   ├── profile.jsx      # Profil utilisateur
│   │   │   ├── legal.jsx        # Mentions légales RGPD
│   │   │   └── movieDetail.jsx  # Détails + reviews
│   │   ├── AdminMovies.js       # Gestion films (admin)
│   │   ├── AdminUsers.js        # Gestion users (admin)
│   │   └── utils/
│   │       └── csrf.js          # Helper CSRF
│   └── package.json             # Dépendances frontend
├── tests/
│   ├── security.unit.test.js    # Tests unitaires sécurité
│   └── security.integration.test.js # Tests d'intégration
├── package.json                 # Dépendances racine (Jest)
└── README.md                    # Ce fichier
```

### Architecture des services

```
Frontend (React:3000) ←→ Serveur Principal (4000)
                         ├→ Service Auth (3001)
                         ├→ Service Films (4001)
                         ├→ Service Reviews (3003)
                         └→ MySQL Database (3306)
```

---

## 💾 Installation

### 1. Cloner le dépôt

#### 🪟 Windows (PowerShell)

```powershell
git clone https://github.com/marineesta05/PopcornView.git
cd PopcornView
```

#### 🍎 macOS/Linux (Terminal)

```bash
git clone https://github.com/marineesta05/PopcornView.git
cd PopcornView
```

### 2. Installer les dépendances

#### Installation complète (toutes plateformes)

```bash
# Dépendances racine (Jest pour les tests)
npm install

# Dépendances backend
cd backend
npm install
npm audit
npm audit fix

# Dépendances frontend
cd ../frontend
npm install
npm audit
npm audit fix

# Retour à la racine
cd ..
```

#### Liste des dépendances principales

**Backend**

| Package | Version | Usage |
|---------|---------|-------|
| `express` | ^4.18.2 | Framework web |
| `bcryptjs` | ^2.4.3 | Hachage mots de passe |
| `jsonwebtoken` | ^9.0.2 | Authentification JWT |
| `mysql2` | ^3.15.3 | Connexion MySQL |
| `helmet` | ^8.1.0 | Headers de sécurité |
| `express-rate-limit` | ^8.2.1 | Rate limiting |
| `express-validator` | ^7.3.1 | Validation entrées |
| `cors` | ^2.8.5 | CORS |
| `dotenv` | ^16.0.3 | Variables d'environnement |
| `socket.io` | ^4.8.1 | WebSocket temps réel |

**Frontend**

| Package | Version | Usage |
|---------|---------|-------|
| `react` | ^18.0.0 | Framework UI |
| `react-dom` | ^18.0.0 | Rendu DOM |
| `react-router-dom` | ^6.0.0 | Routing |
| `react-scripts` | ^5.0.1 | Scripts React |
| `axios` | ^1.0.0 | Requêtes HTTP |
| `socket.io-client` | ^4.8.1 | WebSocket client |

---

## ⚙️ Configuration

### Variables d'environnement

#### 1. Créer le fichier `.env`

#### 🪟 Windows (PowerShell)

```powershell
cd backend
Copy-Item .env.example .env
```

#### 🍎 macOS/Linux (Terminal)

```bash
cd backend
cp .env.example .env
```

#### 2. Générer une clé JWT sécurisée

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Exemple de sortie :**
```
8f7a9b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

#### 3. Obtenir une clé API TMDB (optionnel)

1. Créez un compte sur [TMDB](https://www.themoviedb.org/)
2. Accédez à [API Settings](https://www.themoviedb.org/settings/api)
3. Demandez une clé API (gratuite)
4. Copiez la clé dans le fichier `.env`

#### 4. Compléter le fichier `.env`

```bash
# BASE DE DONNÉES
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=votre_mot_de_passe_mysql
DB_NAME=popcorn_view
DB_PORT=3306

# SERVEURS
SERVER_PORT=3001          # Service auth
PORT=4000                 # Serveur principal
FILM_SERVER_PORT=4001     # Service films
REVIEW_SERVICE_PORT=3003  # Service reviews

# JWT (COLLEZ LA CLÉ GÉNÉRÉE ICI)
JWT_SECRET=votre_cle_jwt_generee_64_caracteres

# TMDB API (Optionnel - pour importer des films)
TMDB_API_KEY=votre_cle_tmdb_optionnelle

# FRONTEND
REACT_APP_API_URL=http://localhost:4000
REACT_APP_FILMS_API_URL=http://localhost:4001
FRONTEND_URL=http://localhost:3000

# ADMIN PAR DÉFAUT (À CHANGER EN PRODUCTION !)
ADMIN_EMAIL=admin@popcornview.com
ADMIN_PASSWORD=Admin@SecurePass2024!
ADMIN_NOM=Administrateur
ADMIN_PRENOM=Système
```

#### Configuration des variables

| Variable | Description | Exemple | Obligatoire |
|----------|-------------|---------|-------------|
| `DB_HOST` | Hôte MySQL | `localhost` | ✅ |
| `DB_USER` | Utilisateur MySQL | `root` | ✅ |
| `DB_PASSWORD` | Mot de passe MySQL | `mypassword` | ✅ |
| `DB_NAME` | Nom de la base | `popcorn_view` | ✅ |
| `DB_PORT` | Port MySQL | `3306` | ⚠️ |
| `JWT_SECRET` | Clé JWT (64+ chars) | `8f7a9b2c...` | ✅ |
| `SERVER_PORT` | Port service auth | `3001` | ⚠️ |
| `PORT` | Port backend principal | `4000` | ⚠️ |
| `FILM_SERVER_PORT` | Port service films | `4001` | ⚠️ |
| `REVIEW_SERVICE_PORT` | Port reviews | `3003` | ⚠️ |
| `TMDB_API_KEY` | Clé API TMDB | `abc123...` | ❌ |

**Légende :**
- ✅ Obligatoire
- ⚠️ Recommandé (valeur par défaut existe)
- ❌ Optionnel

#### 5. Vérifier la sécurité du .env

```bash
# Vérifier que .env est ignoré par Git
cat .gitignore | grep .env
# Attendu : .env doit apparaître

# Vérifier que .env n'est PAS dans Git
git status
# .env ne doit PAS apparaître dans les fichiers à committer
```

---

## 🗄️ Base de données

### 1. Créer la base de données MySQL

#### Connexion à MySQL- Options 1

Ouvrir votre logiciel MySQL (dans notre cas PhpMyAdmin) et importer la Base donnees

#### Option 2
Ouvrir votre logiciel MySQL (dans notre cas PhpMyAdmin) 

```sql
CREATE DATABASE IF NOT EXISTS popcorn_view 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Créer un utilisateur dédié (recommandé)
CREATE USER 'pv_user'@'localhost' IDENTIFIED BY 'StrongPassword2024!';
GRANT ALL PRIVILEGES ON popcorn_view.* TO 'pv_user'@'localhost';
FLUSH PRIVILEGES;

-- Quitter MySQL
EXIT;
```

### 2. Initialiser les tables (Si option 2)

Les tables seront créées automatiquement au premier lancement du serveur backend. Un utilisateur administrateur sera également créé selon les variables `ADMIN_*` du fichier `.env`.

**Alternative :** Si vous avez un fichier SQL de dump, importez-le :

```bash
mysql -u root -p popcorn_view < chemin/vers/dump.sql
```

---

## 🚀 Lancement de l'application

### Option 1 : Lancement automatique (recommandé)

#### 🪟 Windows

```powershell
cd backend
.\start-all.bat
```

Ce script ouvre automatiquement 4 fenêtres PowerShell pour :
- Serveur principal (port 4000)
- Service authentification (port 3001)
- Service films (port 4001)
- Service reviews (port 3003)

#### 🍎 macOS/Linux

```bash
cd backend
chmod +x start-all.sh  # Rendre le script exécutable (une seule fois)
./start-all.sh
```

Ce script lance les 4 services backend dans des terminaux séparés.

### Option 2 : Lancement manuel

Si vous préférez contrôler chaque service individuellement :

#### 🪟 Windows (PowerShell) - Ouvrez 4 fenêtres

**Fenêtre 1 - Serveur principal :**
```powershell
cd backend
node server.js
```

**Fenêtre 2 - Service auth :**
```powershell
cd backend\user
node server.js
```

**Fenêtre 3 - Service films :**
```powershell
cd backend
node index.js
```

**Fenêtre 4 - Service reviews :**
```powershell
cd backend\movie
node serverReview.js
```

#### 🍎 macOS/Linux (Terminal) - Ouvrez 4 onglets

**Onglet 1 - Serveur principal :**
```bash
cd backend
node server.js
```

**Onglet 2 - Service auth :**
```bash
cd backend/user
node server.js
```

**Onglet 3 - Service films :**
```bash
cd backend
node index.js
```

**Onglet 4 - Service reviews :**
```bash
cd backend/movie
node serverReview.js
```

### Lancement du frontend

Dans une nouvelle fenêtre/onglet de terminal :

```bash
cd frontend
npm start
```

Le frontend démarre automatiquement sur **http://localhost:3000**

### Vérification du bon fonctionnement

Ouvrez votre navigateur et accédez à :

- **Frontend :** http://localhost:3000
- **API principale :** http://localhost:4000
- **Service auth :** http://localhost:3001
- **Service films :** http://localhost:4001
- **Service reviews :** http://localhost:3003

---

## 🧪 Tests

### Lancer tous les tests

```bash
# Depuis la racine du projet
npm test
```

### Lancer uniquement les tests de sécurité

```bash
npx jest tests/security.unit.test.js tests/security.integration.test.js --runInBand
```

### Structure des tests

```
tests/
├── security.unit.test.js         # Tests unitaires (validation, hachage...)
└── security.integration.test.js  # Tests d'intégration (API, auth...)
```

**Note :** Les tests fournis sont principalement des contrôles statiques et heuristiques. Ils peuvent renvoyer de faux positifs si le style de code change. Adaptez-les selon vos besoins.

---

## 🔒 Sécurité et bonnes pratiques

### Secrets et authentification

- ✅ **JWT_SECRET** : Utilisez une clé longue (64+ caractères) et unique
- ✅ Changez `ADMIN_PASSWORD` en production
- ✅ Ne commitez **JAMAIS** le fichier `.env`
- ✅ Utilisez `NODE_ENV=production` en production
- ✅ Activez les cookies `secure` et `httpOnly` en production

### CORS et origines

```javascript
// backend/server.js - Exemple de configuration CORS stricte
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
};
```

Limitez les origines CORS aux domaines de confiance uniquement.

### Rate Limiting

L'application utilise `express-rate-limit` pour prévenir les attaques par force brute :

- **Login :** 5 tentatives / 15 minutes
- **Register :** 3 comptes / heure / IP
- **API générale :** 100 requêtes / 15 minutes

### Validation des entrées

Toutes les entrées utilisateur sont validées avec `express-validator` :

- Emails : format valide + normalisation
- Mots de passe : 8+ caractères, majuscule, minuscule, chiffre, caractère spécial
- XSS : sanitization avec `sanitize-html`
- SQL Injection : requêtes préparées avec `mysql2`

### Headers de sécurité

Le middleware `helmet` ajoute automatiquement les headers de sécurité :

```
Content-Security-Policy
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security
```

### Audit de sécurité

```bash
# Vérifier les vulnérabilités npm
npm audit

# Corriger automatiquement
npm audit fix

# Forcer les corrections (attention aux breaking changes)
npm audit fix --force
```

---

## 🔧 Dépannage

### `react-scripts n'est pas reconnu`

Si `npm start` échoue avec cette erreur :

```bash
cd frontend
npm install react-scripts@5.0.1 --save
npm start
```

### Erreur de connexion MySQL

**Symptômes :** `ER_ACCESS_DENIED_ERROR` ou `ECONNREFUSED`

**Solutions :**

1. Vérifiez que MySQL est démarré
2. Vérifiez les identifiants dans `.env`
3. Testez la connexion manuellement :

```bash
mysql -u root -p -h localhost
```

4. Vérifiez les permissions de l'utilisateur :

```sql
SHOW GRANTS FOR 'pv_user'@'localhost';
```

### Port déjà utilisé

**Symptômes :** `EADDRINUSE: address already in use`

**Solutions :**

#### 🪟 Windows

```powershell
# Trouver le processus sur le port 4000
netstat -ano | findstr :4000

# Tuer le processus (remplacer PID par le numéro affiché)
taskkill /PID <PID> /F
```

#### 🍎 macOS/Linux

```bash
# Trouver le processus sur le port 4000
lsof -i :4000

# Tuer le processus (remplacer PID par le numéro affiché)
kill -9 <PID>
```

### JWT_SECRET manquant

**Symptômes :** Erreur au démarrage du serveur

**Solution :** Générez et ajoutez une clé JWT dans `.env` :

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Problèmes de dépendances

```bash
# Nettoyer les modules
rm -rf node_modules package-lock.json

# Réinstaller
npm install

# Ou avec cache clean
npm cache clean --force
npm install
```

### Base de données non initialisée

Si les tables n'existent pas :

1. Vérifiez que `DB_NAME` existe dans MySQL
2. Lancez le serveur backend - il créera les tables automatiquement
3. Vérifiez les logs du serveur pour d'éventuelles erreurs

### Erreur CORS

Si le frontend ne peut pas communiquer avec le backend :

1. Vérifiez que `FRONTEND_URL` dans `.env` correspond à l'URL du frontend
2. Vérifiez que le backend est bien lancé
3. Vérifiez les headers CORS dans les outils de développement du navigateur

---

## 📝 Commandes utiles

### Développement

```bash
# Lancer les serveurs backend (Windows)
cd backend && start-all.bat

# Lancer les serveurs backend (macOS/Linux)
cd backend && ./start-all.sh

# Lancer le frontend
cd frontend && npm start

# Tests
npm test

# Audit de sécurité
npm audit
```

### Production

```bash
# Build du frontend
cd frontend
npm run build

# Lancer en mode production
NODE_ENV=production node server.js
```

---

## 📄 Licence

Ce projet est réalisé dans un cadre **pédagogique**.

- **Année :** 2025
- **École :** EFREI Paris
- **Module :** Sécurité des Applications Web
- **Version :** 1.0.0 Sécurisée
- **Dernière mise à jour :** Décembre 2025

---


**Merci d'utiliser PopcornView ! 🍿**
