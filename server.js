const path = require('path');
require('dotenv').config({ silent: true });

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');

console.log('--- DÉMARRAGE DU SERVEUR ---');
console.log('Mode : Stockage en mémoire activé (Bypass MongoDB)');
console.log('NODE_ENV :', process.env.NODE_ENV);
console.log('----------------------------');

const defaultCandidates = [
  { id: 'c1', name: 'KATEMBO SILUSAWA Jean-Luc', label: 'Candidat N° 1', image: '/images/JeanLuc.jpeg' },
  { id: 'c2', name: 'MVUTSENEZA NYINAWABEGA Ilone', label: 'Candidat N° 2', image: '/images/ilone.jpeg' },
  { id: 'c3', name: 'KALONJI WA KALONJI Daniel', label: 'Candidat N° 3', image: '/images/kalonji.jpeg' }
];

const defaultElection = {
  title: 'Vote des élèves du secondaire',
  description: 'Élection des représentants de classe et des délégués de l’établissement.'
};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const adminTokens = new Set();

class MemoryElectionStore {
  constructor() {
    this.state = null;
    this.images = new Map();
  }

  async connect() {
    // Connexion instantanée sans réseau
    return true;
  }

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

  async ping() {
    return true;
  }

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

  app.post('/api/admin/reset', requireAdmin, async (req, res, next) => {
    try {
      await store.reset();
      return res.json({ message: 'Scrutin réinitialisé avec succès.' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/vote', async (req, res, next) => {
    try {
      const { studentId, candidateId } = req.body || {};
      const safeStudentId = String(studentId || '').trim();
      const safeCandidateId = String(candidateId || '').trim();

      if (!safeStudentId || !isValidStudentId(safeStudentId)) {
        return res.status(400).json({ error: 'Identifiant invalide (ex: NV0001 à NV0180).' });
      }

      if (!safeCandidateId) {
        return res.status(400).json({ error: 'Veuillez sélectionner un candidat.' });
      }

      const result = await store.recordVote(safeStudentId, safeCandidateId);
      if (result === 'duplicate') {
        return res.status(409).json({ error: 'Vous avez déjà voté.' });
      }

      const state = await store.getState();
      const candidate = state.candidates.find((item) => item.id === safeCandidateId);
      return res.status(201).json({
        message: 'Votre vote a été enregistré avec succès.',
        candidate: candidate ? candidate.name : ''
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

const store = new MemoryElectionStore();
const app = createApp(store, ADMIN_PASSWORD);

async function startServer() {
  await store.connect();
  await store.initialize();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Serveur démarré avec succès sur le port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Erreur démarrage:', err);
});