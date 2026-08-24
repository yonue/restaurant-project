# Restaurant

Application web de gestion et de réservation pour un restaurant. Le projet est composé d’une API REST Node.js/Express et d’une interface Next.js/React.

## Fonctionnalités

- consultation et gestion du menu ;
- réservations et gestion des tables ;
- commandes ;
- gestion des utilisateurs, employés et rôles ;
- avis clients et favoris ;
- galerie et médias du site ;
- horaires d’ouverture ;
- tableau de bord d’administration ;
- notifications, temps réel et exports.

## Prérequis

- Node.js et npm ;
- MySQL lancé localement ou accessible sur le réseau ;
- une base de données MySQL dédiée au projet.

## Installation

À la racine du projet :

```bash
cd back-end
npm install

cd ../front-end
npm install
```

## Configuration du backend

Créer le fichier `back-end/.env` :

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=restaurant

JWT_SECRET=change-me-in-development
FRONTEND_ORIGIN=http://localhost:3000

# Optionnel : configuration e-mail
GMAIL_SERVICE=gmail
GMAIL_USER=
GMAIL_PASSWORD=

# Optionnel : compte administrateur créé par le seed
ADMIN_EMAIL=admin@restaurant.local
ADMIN_PASSWORD=Admin123!
```

Le backend crée et synchronise automatiquement ses tables au démarrage. La base `restaurant` doit toutefois exister dans MySQL.

## Lancement en développement

Ouvrir deux terminaux.

Terminal 1 — API :

```bash
cd back-end
npm run dev
```

L’API est disponible sur [http://localhost:4000](http://localhost:4000).

Terminal 2 — interface :

```bash
cd front-end
npm run dev
```

L’interface est disponible sur [http://localhost:3000](http://localhost:3000). Elle utilise par défaut l’API située sur `http://localhost:4000/api`. Pour modifier cette adresse, créer `front-end/.env.local` :

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

## Données de démonstration

Pour créer les rôles, utilisateurs, catégories, tables et produits de démonstration :

```bash
cd back-end
npm run seed
```

Le compte administrateur par défaut est `admin@restaurant.local` avec le mot de passe `Admin123!`, sauf si `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont définis dans `.env`. Ces identifiants sont réservés au développement.

## Scripts disponibles

### Backend

```bash
npm run dev       # démarrage avec nodemon
npm start         # démarrage avec nodemon
npm run seed      # données de démonstration
npm run seed:demo # données de démonstration en mode demo
npm test          # vérification placeholder
```

### Frontend

```bash
npm run dev   # serveur de développement
npm run build # build de production
npm start     # lancement du build
npm run lint  # vérification ESLint
```

## Structure

```text
.
├── back-end/
│   ├── server.js
│   ├── scripts/
│   ├── src/controllers/
│   ├── src/models/
│   ├── src/routes/
│   └── src/services/
├── front-end/
│   └── src/app/
├── .gitignore
└── README.md
```

Les fichiers `.env`, les dépendances, les builds et les fichiers uploadés localement sont volontairement exclus du dépôt par `.gitignore`.
