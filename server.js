const path = require('path');
// Charge le fichier .env en local s'il existe, sans bloquer sur Render
require('dotenv').config({ silent: true });

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { MongoClient } = require('mongodb');

// Vérification au démarrage dans les logs Render
const mongoUri = process.env.MONGODB_URI;
console.log('--- VÉRIFICATION DÉMARRAGE ---');
console.log('MONGODB_URI détecté :', mongoUri ? 'OUI (Chaîne présente)' : 'NON (Variable absente)');
console.log('NODE_ENV :', process.env.NODE_ENV);
console.log('------------------------------');

const defaultCandidates = [
  { id: 'c1', name: 'KATEMBO SILUSAWA Jean-Luc', label: 'Candidat N° 1', image: '/images/JeanLuc.jpeg' },
  { id: 'c2', name: 'MVUTSENEZA NYINAWABEGA Ilone', label: 'Candidat N° 2', image: '/images/ilone.jpeg' },
  { id: 'c3', name: 'KALONJI WA KALONJI Daniel', label: 'Candidat N° 3', image: '/images/kalonji.jpeg' }
];

const defaultElection = {
  title: 'Vote des élèves du secondaire',
  description: 'Élection des représentants de classe et des délégués de l’établissement.'
};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
const adminTokens = new Set();

class MongoElectionStore {
  constructor(uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB || 'nodifs_vote') {
    this.uri = uri;
    this.dbName = dbName;
    this.client = null;
  }

  async connect() {
    if (!this.uri) {
      throw new Error('La variable MONGODB_URI doit être définie pour connecter MongoDB.');
    }

    this.client = new MongoClient(this.uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      family: 4, // Force IPv4
      tls: true,
      tlsAllowInvalidCertificates: true, // Évite les blocages de certificat SSL sur Render
      retryWrites: true
    });
    
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.elections = this.db.collection('elections');
    this.images = this.db.collection('candidate_images');
  }

  async initialize() {
    await this.elections.updateOne(
      { _id: 'main' },
      {
        $setOnInsert: {
          ...defaultElection,
          candidates: defaultCandidates,
          votes: [],
          candidateSequence: defaultCandidates.length
        }
      },
      { upsert: true }
    );
  }

  async ping() {
    await this.db.command({ ping: 1 });
  }

  async getState() {
    const { _id, ...state } = await this.elections.findOne({ _id: 'main' });
    return state;
  }

  async addCandidate(input) {
    const number = { $add: [{ $ifNull: ['$candidateSequence', defaultCandidates.length] }, 1] };
    const candidate = {
      id: { $concat: ['c', { $toString: number }] },
      name: { $literal: input.name },
      label: input.label ? { $literal: input.label } : { $concat: ['Candidat N° ', { $toString: number }] },
      image: { $literal: input.image }
    };

    const state = await this.elections.findOneAndUpdate(
      { _id: 'main' },
      [{
        $set: {
          candidateSequence: number,
          candidates: {
            $concatArrays: [{ $ifNull: ['$candidates', []] }, [candidate]]
          }
        }
      }],
      { returnDocument: 'after' }
    );

    return state.candidates[state.candidates.length - 1];
  }

  async saveImage(filename, contentType, data) {
    await this.images.insertOne({ _id: filename, contentType, data });
  }

  async getImage(filename) {
    return this.images.findOne({ _id: filename });
  }

  async deleteImage(filename) {
    await this.images.deleteOne({ _id: filename });
  }

  async recordVote(studentId, candidateId) {
    const result = await this.elections.updateOne(
      {
        _id: 'main',
        'votes.studentId': { $ne: studentId },
        'candidates.id': candidateId
      },
      { $push: { votes: { studentId, candidateId, createdAt: new Date() } } }
    );

    if (result.modifiedCount) {
      return 'recorded';
    }

    const state = await this.getState();
    return state.votes.some((vote) => vote.studentId === studentId) ? 'duplicate' : 'candidate-not-found';
  }

  async reset() {
    await this.elections.updateOne(
      { _id: 'main' },
      {
        $set: {
          ...defaultElection,
          candidates: defaultCandidates,
          votes: [],
          candidateSequence: defaultCandidates.length
        }
      }
    );
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

class MemoryElectionStore {
  constructor() {
    this.state = null;
    this.images = new Map();
  }

  async connect() {}

  async initialize() {
    if (!this.state) {
      this.state = {
        ...defaultElection,
        candidates: defaultCandidates.map((candidate) => ({ ...candidate })),
        votes: [],
        candidateSequence: defaultCandidates.length
      };
    }
  }

  async ping() {}

  async getState() {
    return structuredClone(this.state);
  }

  async addCandidate(input) {
    this.state.candidateSequence += 1;
    const number = this.state.candidateSequence;
    const candidate = {
      id: `c${number}`,
      name: input.name,
      label: input.label || `Candidat N° ${number}`,
      image: input.image
    };
    this.state.candidates.push(candidate);
    return candidate;
  }

  async saveImage(filename, contentType, data) {
    this.images.set(filename, { contentType, data: Buffer.from(data) });
  }

  async getImage(filename) {
    return this.images.get(filename) || null;
  }

  async deleteImage(filename) {
    this.images.delete(filename);
  }

  async recordVote(studentId, candidateId) {
    if (this.state.votes.some((vote) => vote.studentId === studentId)) {
      return 'duplicate';
    }
    if (!this.state.candidates.some((candidate) => candidate.id === candidateId)) {
      return 'candidate-not-found';
    }
    this.state.votes.push({ studentId, candidateId, createdAt: new Date() });
    return 'recorded';
  }

  async reset() {
    this.state = {
      ...defaultElection,
      candidates: defaultCandidates.map((candidate) => ({ ...candidate })),
      votes: [],
      candidateSequence: defaultCandidates.length
    };
  }

  async close() {}
}

function buildResults(state) {
  const counts = new Map();
  for (const vote of state.votes) {
    counts.set(vote.candidateId, (counts.get(vote.candidateId) || 0) + 1);
  }

  return state.candidates.map((candidate) => ({
    ...candidate,
    votes: counts.get(candidate.id) || 0
  }));
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const entry = part.trim();
    if (!entry) return cookies;

    const separatorIndex = entry.indexOf('=');
    const key = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry;
    const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : '';
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function isValidStudentId(studentId) {
  if (typeof studentId !== 'string') return false;
  const trimmed = studentId.trim();
  const validPattern = /^NV(0\d{3}|1[0-7]\d|180)$/;
  return validPattern.test(trimmed);
}

function createApp(store, adminPassword) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  function requireAdmin(req, res, next) {
    const tokenFromHeader = req.headers['x-admin-token'];
    const tokenFromQuery = req.query && req.query.token ? String(req.query.token) : '';
    const cookies = parseCookies(req.headers.cookie || '');
    const token = String(tokenFromHeader || tokenFromQuery || cookies.admin_session || '');

    if (!token || !adminTokens.has(token)) {
      return res.status(401).json({ error: 'Accès réservé à l’administrateur.' });
    }

    return next();
  }

  app.get('/api/health', async (req, res, next) => {
    try {
      await store.ping();
      return res.json({ status: 'ok', app: 'nodifs-vote', timestamp: new Date().toISOString() });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/login', (req, res) => {
    const { password } = req.body || {};

    if (String(password || '').trim() !== adminPassword) {
      return res.status(401).json({ error: 'Mot de passe administrateur incorrect.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    adminTokens.add(token);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax${secure}`);
    return res.json({ token, message: 'Connexion administrateur réussie.' });
  });

  app.get('/api/admin/session', requireAdmin, (req, res) => {
    res.json({ authenticated: true, message: 'Session admin active.' });
  });

  app.get('/api/election', async (req, res, next) => {
    try {
      const state = await store.getState();
      return res.json({
        title: state.title,
        description: state.description,
        candidates: state.candidates,
        totalVotes: state.votes.length,
        results: []
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/results', requireAdmin, async (req, res, next) => {
    try {
      const state = await store.getState();
      return res.json({
        title: state.title,
        totalVotes: state.votes.length,
        results: buildResults(state)
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/voters', requireAdmin, async (req, res, next) => {
    try {
      const state = await store.getState();
      const candidatesById = new Map(state.candidates.map((candidate) => [candidate.id, candidate]));
      const votes = state.votes
        .map((vote) => ({
          studentId: vote.studentId,
          candidateId: vote.candidateId,
          candidateName: candidatesById.has(vote.candidateId)
            ? candidatesById.get(vote.candidateId).name
            : 'Candidat inconnu'
        }))
        .sort((a, b) => a.studentId.localeCompare(b.studentId));

      return res.json({ totalVotes: votes.length, votes });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/admin/export/csv', requireAdmin, async (req, res, next) => {
    try {
      const state = await store.getState();
      const rows = buildResults(state);
      const header = 'Candidate,NumeroCandidat,Votes\n';
      const body = rows
        .map((candidate) => {
          const numeroCandidat = candidate.label || `Candidat N° ${String(candidate.id).replace('c', '')}`;
          return `${candidate.name},${numeroCandidat},${candidate.votes}`;
        })
        .join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="election_results.csv"');
      return res.send(`${header}${body}\n`);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.admin_session || '';

    if (token) {
      adminTokens.delete(token);
    }

    res.setHeader('Set-Cookie', 'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    return res.json({ message: 'Déconnexion admin réussie.' });
  });

  app.post('/api/admin/reset', requireAdmin, async (req, res, next) => {
    try {
      await store.reset();
      return res.json({ message: 'Scrutin réinitialisé avec succès.' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/candidates', requireAdmin, upload.single('candidateImage'), async (req, res, next) => {
    let filename;
    try {
      const safeName = String(req.body.name || req.body.candidateName || '').trim();
      const safeLabel = String(req.body.label || req.body.candidateLabel || '').trim();
      const extension = req.file ? (path.extname(req.file.originalname).toLowerCase() || '.png') : '';
      const image = req.file
        ? `/api/images/${crypto.randomBytes(16).toString('hex')}${extension}`
        : String(req.body.image || req.body.candidateImage || '').trim();

      if (!safeName) {
        return res.status(400).json({ error: 'Le nom du candidat est obligatoire.' });
      }

      if (req.file) {
        filename = path.basename(image);
        await store.saveImage(filename, req.file.mimetype, req.file.buffer);
      }

      const candidate = await store.addCandidate({
        name: safeName,
        label: safeLabel,
        image: image || '/images/default.png'
      });

      return res.status(201).json({
        message: 'Candidat ajouté avec succès.',
        candidate
      });
    } catch (error) {
      if (filename) {
        try {
          await store.deleteImage(filename);
        } catch (cleanupError) {
          console.error('Impossible de supprimer une image orpheline:', cleanupError);
        }
      }
      return next(error);
    }
  });

  app.get('/api/images/:filename', async (req, res, next) => {
    try {
      const image = await store.getImage(req.params.filename);
      if (!image) {
        return res.status(404).json({ error: 'Image introuvable.' });
      }

      res.setHeader('Content-Type', image.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const binary = image.data;
      const data = Buffer.isBuffer(binary)
        ? binary
        : Buffer.isBuffer(binary.buffer)
          ? binary.buffer.subarray(0, binary.position || binary.buffer.length)
          : Buffer.from(binary);
      return res.send(data);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/vote', async (req, res, next) => {
    try {
      const { studentId, candidateId } = req.body || {};
      const safeStudentId = String(studentId || '').trim();
      const safeCandidateId = String(candidateId || '').trim();

      if (!safeStudentId) {
        return res.status(400).json({ error: 'Le numéro de l’élève est obligatoire.' });
      }

      if (!isValidStudentId(safeStudentId)) {
        return res.status(400).json({
          error: 'L’identifiant est invalide. Utilisez un numéro de la forme NV0001 à NV0180.'
        });
      }

      if (!safeCandidateId) {
        return res.status(400).json({ error: 'Veuillez sélectionner un candidat.' });
      }

      const result = await store.recordVote(safeStudentId, safeCandidateId);
      if (result === 'candidate-not-found') {
        return res.status(404).json({ error: 'Candidat introuvable.' });
      }
      if (result === 'duplicate') {
        return res.status(409).json({
          error: 'Vous avez déjà voté. Un seul vote est autorisé par élève.'
        });
      }

      const state = await store.getState();
      const candidate = state.candidates.find((item) => item.id === safeCandidateId);
      return res.status(201).json({
        message: 'Votre vote a bien été enregistré.',
        candidate: candidate.name,
        results: []
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    console.error('Erreur de requête:', error);
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Le fichier envoyé est invalide ou trop volumineux.' });
    }
    return res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  return app;
}

const useMemoryStore = process.env.NODE_ENV !== 'production' && !process.env.MONGODB_URI;
const defaultStore = useMemoryStore ? new MemoryElectionStore() : new MongoElectionStore();
const app = createApp(defaultStore, ADMIN_PASSWORD);

async function startServer(port = process.env.PORT || 3000, options = {}) {
  const adminPassword = options.adminPassword || ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('La variable ADMIN_PASSWORD doit être définie en production.');
  }

  const store = options.store || defaultStore;
  await store.connect();
  await store.initialize();

  const serverApp = store === defaultStore ? app : createApp(store, adminPassword);
  const listenPort = Number(port);
  if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
    await store.close();
    throw new Error('Le port du serveur est invalide.');
  }
  const server = await new Promise((resolve, reject) => {
    const listener = serverApp.listen(listenPort, () => resolve(listener));
    listener.once('error', reject);
  });

  server.once('close', () => {
    store.close().catch((error) => {
      console.error('Erreur lors de la fermeture de MongoDB:', error);
    });
  });
  return server;
}

if (require.main === module) {
  if (useMemoryStore) {
    console.warn('MONGODB_URI absent : stockage en mémoire activé pour le développement. Les données seront perdues à l’arrêt.');
  }
  startServer().catch((error) => {
    console.error('Impossible de démarrer le serveur:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  startServer,
  MongoElectionStore,
  MemoryElectionStore,
  defaultCandidates,
  buildResults,
  ADMIN_PASSWORD
};