# PopcornView

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
- Node.js (v16+ recommandé) et npm
- MySQL (ou compatible) pour la base de données
- Git pour cloner le dépôt

Sur Windows, utilisez PowerShell ou l'invite de commandes pour les étapes ci-dessous.

**Structure principale**
- `backend/` : serveur Express (API, auth, stockage local JSON)
- `frontend/` : application React
- `tests/` : tests Jest (sécurité statique et d'intégration)
- `data/` : stockage local (films)

**Variables d'environnement**

Le backend utilise un fichier `.env` (chargé via `dotenv`). Un exemple est fourni : `backend/.env.example`.
Créez `backend/.env` en copiant cet exemple et en renseignant vos valeurs réelles.

Clés importantes à définir dans `backend/.env` :

- `DB_HOST` : hôte MySQL (ex : `localhost`)
- `DB_USER` : utilisateur DB
- `DB_PASSWORD` : mot de passe DB
- `DB_NAME` : nom de la base (ex : `popcorn_view`)
- `DB_PORT` : port MySQL (3306 par défaut)
- `SERVER_PORT` : port du service utilisateur interne (ex : 3001)
- `PORT` : port principal du backend express (ex : 4000)
- `JWT_SECRET` : secret JWT fort (NE PAS COMMIT)
- `TMDB_API_KEY` : clé TMDB (optionnel, pour récupérer films)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOM`, `ADMIN_PRENOM` : valeurs utilisées pour créer un admin initial si manquant (remplacez-les en prod)

Note de sécurité : ne commitez jamais un `.env` contenant des secrets. `backend/.env.example` sert de modèle.

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

**Installation & exécution (développement)**

- Cloner le dépôt :

```powershell
git clone https://github.com/marineesta05/PopcornView.git
cd PopcornView
```

- Installer les dépendances (racine pour les tests, puis backend/frontend) :

```powershell
npm install        # installe Jest pour exécuter les tests
cd backend
npm install
cd ..\frontend
npm install
cd ..
```

- Créer `backend/.env` en copiant `backend/.env.example` et en renseignant vos valeurs.

- Lancer le backend :

```powershell
cd backend
npm start
# serveur principal écoute sur le port `PORT` (ex: 4000)
```

- Lancer le frontend (dev) :

```powershell
cd frontend
npm start
# React démarre sur http://localhost:3000 par défaut
```

**Lancement multi-serveurs (Windows)**

Un script batch est fourni pour démarrer les différents services dans des fenêtres séparées (Windows) :

```powershell
cd backend
start-all.bat
```

Cela ouvrira des fenêtres distinctes pour les serveurs `user`, `movie` et le backend principal.

**Tests**

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

