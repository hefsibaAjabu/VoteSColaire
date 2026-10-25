// Charger les variables d'environnement du fichier .env en local
require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Configuration des middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuration du moteur de vues
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Classe de gestion de la base de données MongoDB
class DatabaseManager {
  constructor(dbName = 'nodifs_vote') {
    this.dbName = dbName;
    this.client = null;
    this.db = null;
    this.elections = null;
    this.images = null;
    this.connected = false;
  }

  async connect() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error('La variable MONGODB_URI doit être définie pour connecter MongoDB.');
    }

    console.log('Connexion à MongoDB Atlas en cours...');

    this.client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      family: 4, // forcer IPv4 (évite certains blocages réseau sur Render)
      retryWrites: true
    });

    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.elections = this.db.collection('elections');
    this.images = this.db.collection('candidate_images');
    this.connected = true;

    console.log('Connecté avec succès à MongoDB Atlas !');
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.connected = false;
      console.log('Connexion MongoDB fermée.');
    }
  }
}

// Initialisation de l'instance du gestionnaire de base de données
const dbManager = new DatabaseManager();

// Routes principales de l'application
app.get('/', async (req, res) => {
  try {
    res.render('index', { message: 'Bienvenue sur NODIFS VOTE' });
  } catch (err) {
    console.error("Erreur lors du chargement de la page d'accueil:", err);
    res.status(500).send('Erreur interne du serveur');
  }
});

// Route de diagnostic : ouvrir /health pour voir si MongoDB est connecté
app.get('/health', (req, res) => {
  res.json({ server: 'ok', mongodb: dbManager.connected ? 'connected' : 'disconnected' });
});

// Tentatives de connexion MongoDB en arrière-plan (3 essais)
async function connectWithRetry(attempts = 3, delayMs = 5000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await dbManager.connect();
      return;
    } catch (error) {
      console.error(`MongoDB indisponible (essai ${i}/${attempts}) :`, error.message);
      if (i < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  console.error('Impossible de se connecter à MongoDB après plusieurs essais.');
}

// Fonction de démarrage du serveur
async function startServer() {
  // Le serveur HTTP démarre d'abord, pour que Render détecte le port
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur démarré et en écoute sur le port ${PORT}`);
  });

  await connectWithRetry();
}

// Fermeture propre
process.on('SIGTERM', async () => {
  await dbManager.close();
  process.exit(0);
});

// Lancement automatique du serveur
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Impossible de démarrer le serveur:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, DatabaseManager, ObjectId };