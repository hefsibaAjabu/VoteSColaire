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
  }

  async connect() {
    // Lecture dynamique de la variable au moment de l'exécution
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error('La variable MONGODB_URI doit être définie pour connecter MongoDB.');
    }

    console.log('Connexion à MongoDB Atlas en cours...');

    this.client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      retryWrites: true
    });

    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.elections = this.db.collection('elections');
    this.images = this.db.collection('candidate_images');

    console.log('Connecté avec succès à MongoDB Atlas !');
  }

  async close() {
    if (this.client) {
      await this.client.close();
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
    console.error('Erreur lors du chargement de la page d\'accueil:', err);
    res.status(500).send('Erreur interne du serveur');
  }
});

// Fonction de démarrage du serveur
async function startServer() {
  try {
    await dbManager.connect();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Serveur démarré et en écoute sur le port ${PORT}`);
    });
  } catch (error) {
    console.error('Erreur critique lors du démarrage du serveur :', error);
    process.exit(1);
  }
}

// Lancement automatique du serveur
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Impossible de démarrer le serveur:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, DatabaseManager };