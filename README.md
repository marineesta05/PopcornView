# PopcornView - Application Web Sécurisée
> Application de gestion de films avec authentification robuste et conformité RGPD
Guide d'installation et d'exécution pour les contributeurs qui clonent le dépôt.

Ce README explique comment configurer l'environnement, lancer le backend et le frontend en développement, exécuter les tests et quelques bonnes pratiques de sécurité.

**Table des matières**
- Prérequis
- Structure du projet
- Variables d'environnement (.env)
- Base de données
- Installation & exécution (dev)
- Lancement multi-serveurs (Windows)
- Tests
- Sécurité et bonnes pratiques
- Dépannage rapide

**Prérequis**
- Node.js (v16+ recommandé) et npm [Telechargez Node](https://nodejs.org/fr "Site NodeJs")
- npm (inclus avec Node.js)
- MySQL (ou compatible) pour la base de données [MySQL version 8.0.44](https://dev.mysql.com/downloads/installer/) 
- Git pour cloner le dépôt https://git-scm.com/install/ [Telechargez Git](https://git-scm.com/install/)

Sur Windows, utilisez PowerShell ou l'invite de commandes pour les étapes ci-dessous.

### Vérification des Installations

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

**Structure principale**
- `backend/` : serveur Express (API, auth, stockage local JSON)
- `frontend/` : application React
- `tests/` : tests Jest (sécurité statique et d'intégration)
- `data/` : stockage local (films)

```
popcorn-view/
├── backend/
│   ├── server.js                # Serveur principal (port 4000)
│   ├── index.js                 # Serveur pour la gestion des films (port 4001)
│   ├── database.js              # Configuration MySQL avec timeouts
│   ├── .env                     # Variables d'environnement (NON COMMITÉ)
│   ├── .env.example             # Template de configuration
│   ├── package.json             # Dépendances backend
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
└── README.md                    # Ce fichier

```

**Variables d'environnement**

Le backend utilise un fichier `.env` (chargé via `dotenv`). Un exemple est fourni : `backend/.env.example`.
Créez `backend/.env` en copiant cet exemple et en renseignant vos valeurs réelles.

Clés importantes à définir dans `backend/.env` :

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
| `REVIEW_SERVICE_PORT` | Port reviews | `3003` | ⚠️ |
| `TMDB_API_KEY` | Clé API TMDB | `abc123...` | ❌ |
| `FILM_SERVER_PORT` | Port pour les avis | 4001 | ⚠️ |


- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOM`, `ADMIN_PRENOM` : valeurs utilisées pour créer un admin initial si manquant (remplacez-les en prod)
  
**Légende** :
- ✅ Obligatoire
- ⚠️ Recommandé (valeur par défaut existe)
- ❌ Optionnel
  

**Important!!** : Pour generer aleatoirement une cle JWT mettre cette commande dans le terminal
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
**Cela va renvoyer une cle JWT que vous pourrez coller dans le fichier .env**

Note de sécurité : ne commitez jamais un `.env` contenant des secrets. `backend/.env.example` sert de modèle.

### Dépendances Principales

#### Backend

| Package | Version | Usage |
|---------|---------|-------|
| `express` | ^4.18.2 | Framework web |
| `bcryptjs` | ^2.4.3 | Hachage mots de passe |
| `jsonwebtoken` | ^9.0.2 | Authentification JWT |
| `mysql2` | ^3.15.3 | Connexion MySQL (Promise) |
| `helmet` | ^8.1.0 | Headers de sécurité |
| `express-rate-limit` | ^8.2.1 | Rate limiting |
| `express-validator` | ^7.3.1 | Validation entrées |
| `validator` | ^13.15.23 | Validation email/strings |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing |
| `dotenv` | ^16.0.3 | Variables d'environnement |
| `socket.io` | ^4.8.1 | WebSocket temps réel |

#### Frontend

| Package | Version | Usage |
|---------|---------|-------|
| `react` | ^18.0.0 | Framework UI |
| `react-dom` | ^18.0.0 | Rendu DOM |
| `react-router-dom` | ^6.0.0 | Routing |
| `axios` | ^1.0.0 | Requêtes HTTP |

---

### Flux de Données

### Commandes d'installation des dépendances

Pour installer rapidement *toutes* les dépendances nécessaires au projet, exécutez ces commandes depuis la racine ou les dossiers indiqués.

1) Installer les outils de test au niveau racine (Jest) :

```powershell
# à la racine du dépôt
npm install --save-dev jest
```

2) Backend — dépendances de production :

```powershell
cd backend
npm install express bcryptjs cookie-parser cors debug dotenv axios express-rate-limit express-validator helmet iconv-lite jsonwebtoken mysql2 node-fetch sanitize-html socket.io validator
```

3) Backend — dépendances de développement (lint, outils) :

```powershell
cd backend
npm install --save-dev eslint @eslint/js eslint-plugin-react globals
```

4) Frontend — dépendances de production :

```powershell
cd frontend
npm install react react-dom react-router-dom axios jwt-decode react-scripts web-vitals @testing-library/dom @testing-library/react @testing-library/jest-dom @testing-library/user-event socket
```

5) Frontend — dépendances de développement (lint) :

```powershell
cd frontend
npm install --save-dev eslint eslint-config-react-app eslint-plugin-react globals
```

Remarques :
- Les versions précises utilisées par le projet sont indiquées dans les `package.json` respectifs — ces commandes installent les dernières versions compatibles.
- Après l'installation, exécutez `npm audit` dans chaque dossier (racine/backend/frontend) et appliquez `npm audit fix` si nécessaire.


```
Frontend (React) ←→ Server Principal (4000)
                    ├→ Service Auth (3001)
                    ├→ Service Reviews (3003)
                    └→ MySQL Database
```



**Base de données**

Le projet utilise MySQL via `mysql2`. Créez la base avant de lancer le serveur :

1. Lancez MySQL (localement ou distant).
2. Créez la base :

```sql
CREATE DATABASE IF NOT EXISTS popcorn_view CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Créez un utilisateur et donnez les droits si besoin :
-- CREATE USER 'pv_user'@'localhost' IDENTIFIED BY 'strong_password';
-- GRANT ALL PRIVILEGES ON popcorn_view.* TO 'pv_user'@'localhost';
```

Le serveur backend crée automatiquement un utilisateur administrateur (selon les variables `ADMIN_*`) si aucun admin n'existe.

Si non, importer le fichier `.sql` ou se trouve la BDD. 

## Installation & exécution (développement)

### - Cloner le dépôt :

```powershell
git clone https://github.com/marineesta05/PopcornView.git
cd PopcornView
```

### - Installer les dépendances (racine pour les tests, puis backend/frontend) :

```powershell
npm install        # installe Jest pour exécuter les tests
cd backend
npm install
# Vérifier les vulnérabilités
npm audit
# Attendu : 0 vulnérabilités High ou Critical
# installer les dependances frontend
cd ..\frontend
npm install
cd ..
```

#### Installer les Dépendances Manquantes (si nécessaire)

Si `npm audit` montre des vulnérabilités :

```bash
npm audit fix
npm audit fix --force  # Si nécessaire
npm install validator  # Dépendance critique pour validation email
```

### - Créer `backend/.env` en copiant `backend/.env.example` et en renseignant vos valeurs.
#### Générer un JWT_SECRET Sécurisé

```bash
# Générer une clé aléatoire de 64 caractères
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Exemple de sortie :
# 8f7a9b2c1d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```
Copiez cette clé dans le fichier `.env`

```bash

# Il faut également générer une clé API TMDB, celle-ci se trouve sur le site TMDB : 
https://developer.themoviedb.org/docs/getting-started
# puis il faut suivre les consignes données sur le site. Une fois la clé API générée, copier la dans le .env.


# BASE DE DONNÉES
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=votre_mot_de_passe_mysql
DB_NAME=popcorn_view
DB_PORT=3306

# SERVEURS
SERVER_PORT=3001
PORT=4000
REVIEW_SERVICE_PORT=3003

# JWT (COLLEZ LA CLÉ GÉNÉRÉE ICI)
JWT_SECRET=

# TMDB API (Optionnel - pour importer des films)
TMDB_API_KEY=votre_cle_tmdb_optionnelle

# FRONTEND
REACT_APP_API_URL=http://localhost:4000
REACT_APP_FILMS_API_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000

# ADMIN PAR DÉFAUT
ADMIN_EMAIL=admin@popcornview.com
ADMIN_PASSWORD=Admin@SecurePass2024!
ADMIN_NOM=Administrateur
ADMIN_PRENOM=Système
```

#### Vérifier la Sécurité du .env

```bash
# Vérifier que .env est ignoré par Git
cat .gitignore | grep .env
# Attendu : .env doit apparaître dans la liste

# Vérifier que .env n'est PAS dans Git
git status
# .env ne doit PAS apparaître dans les fichiers à committer
```


### - Lancer le backend :

```powershell
cd backend
node server.js
#le faire manuelment sur les 4 fichiers back.
```

**Lancement multi-serveurs (Windows)**

Un script batch est fourni pour démarrer les différents services dans des fenêtres séparées (Windows) :

```powershell
cd backend
start-all.bat
```


Ce script ouvre 4 fenêtres de commande automatiquement.

### - Lancer le frontend (dev) :

```powershell
cd frontend
npm start
# React démarre sur http://localhost:3000 par défaut
```

#### Dépannage : `'react-scripts' n’est pas reconnu`

Si `npm start` renvoie l'erreur `react-scripts n’est pas reconnu en tant que commande`, cela signifie que la dépendance `react-scripts` n'est pas installée ou n'est pas disponible dans votre environnement. Pour corriger :

```powershell
cd frontend
npm install react-scripts@5.0.1 --save
npm start
```

Cette commande installe `react-scripts` (version stable 5.0.1 recommandée pour ce projet) puis relance l'application. Si vous utilisez macOS/Linux, exécutez les mêmes commandes dans un terminal bash.


## Tests

Les tests utilisent Jest (configuration au niveau racine). Pour exécuter la suite :

```powershell
# depuis la racine du dépôt
npm test

# exécuter uniquement les tests de sécurité
npx jest tests/security.unit.test.js tests/security.integration.test.js --runInBand
```

Les tests fournis sont principalement des contrôles statiques/heuristiques sur le code (recherche de patterns). Ils peuvent renvoyer de faux positifs si le style de code change : adaptez-les si nécessaire.

**Sécurité & bonnes pratiques**

- JWT : définissez `JWT_SECRET` fort et long; changez-le en production.
- Ne commitez jamais de fichiers `.env` ou de secrets dans le dépôt.
- Changez les valeurs `ADMIN_PASSWORD` par défaut dans l'environnement ; évitez les valeurs faibles comme `admin@123` en production.
- Assurez-vous que `NODE_ENV=production` en prod pour activer les cookies `secure` et comportement prod.
- Limitez les origines CORS autorisées aux domaines de votre frontend.
- Surveillez les logs pour détecter des fuites (`err.stack`) et ne renvoyez pas directement les traces d'erreur au client.


Merci et bon développement !
## 📄 Licence

Ce projet est réalisé dans un cadre pédagogique.  
**Année** : 2025  
**École** : EFREI Paris 
**Module** : Sécurité des Applications Web

---

**Version** : 1.0.0 Sécurisée  
**Dernière mise à jour** : Décembre 2025 

