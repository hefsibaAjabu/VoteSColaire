const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const imageUploadDir = path.join(__dirname, 'public', 'images');

if (!fs.existsSync(imageUploadDir)) {
  fs.mkdirSync(imageUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, imageUploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname) || '.png';
    const safeBaseName = file.originalname.replace(/\.[^/.]+$/, '').replace(/\s+/g, '-').toLowerCase();
    callback(null, `${Date.now()}-${safeBaseName}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const defaultCandidates = [
  { id: 'c1', name: 'KATEMBO SILUSAWA Jean-Luc', label: 'Candidat N° 1', image: '/images/JeanLuc.jpeg' },
  { id: 'c2', name: 'MVUTSENEZA NYINAWABEGA Ilone', label: 'Candidat N° 2', image: '/images/ilone.jpeg' },
  { id: 'c3', name: 'KALONJI WA KALONJI Daniel', label: 'Candidat N° 3', image: '/images/kalonji.jpeg' }
];

const election = {
  title: 'Vote des élèves du secondaire',
  description: 'Élection des représentants de classe et des délégués de l’établissement.',
  candidates: defaultCandidates.map((candidate) => ({ ...candidate }))
};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
const adminTokens = new Set();
const votesByStudent = new Map();
let voteCounts = Object.fromEntries(election.candidates.map((candidate) => [candidate.id, 0]));

function initializeElectionState() {
  election.title = 'Vote des élèves du secondaire';
  election.description = 'Élection des représentants de classe et des délégués de l’établissement.';
  election.candidates = defaultCandidates.map((candidate) => ({ ...candidate }));
  votesByStudent.clear();
  voteCounts = Object.fromEntries(election.candidates.map((candidate) => [candidate.id, 0]));
}

function ensureVoteCount(candidateId) {
  if (!(candidateId in voteCounts)) {
    voteCounts[candidateId] = 0;
  }
}

function registerCandidate(candidate) {
  const safeName = String(candidate.name || '').trim();
  const safeLabel = String(candidate.label || '').trim();
  const safeImage = String(candidate.image || '').trim();

  if (!safeName) {
    throw new Error('Le nom du candidat est obligatoire.');
  }

  const nextNumber = Math.max(
    0,
    ...election.candidates.map((item) => Number(String(item.id).replace(/^c/i, '')) || 0)
  ) + 1;

  const newCandidate = {
    id: `c${nextNumber}`,
    name: safeName,
    label: safeLabel || `Candidat N° ${nextNumber}`,
    image: safeImage || '/images/default.png'
  };

  election.candidates.push(newCandidate);
  ensureVoteCount(newCandidate.id);
  voteCounts[newCandidate.id] = 0;

  return newCandidate;
}

function resetElectionState() {
  election.title = 'Vote des élèves du secondaire';
  election.description = 'Élection des représentants de classe et des délégués de l’établissement.';
  election.candidates = defaultCandidates.map((candidate) => ({ ...candidate }));
  votesByStudent.clear();
  voteCounts = Object.fromEntries(election.candidates.map((candidate) => [candidate.id, 0]));
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function buildResults() {
  return election.candidates.map((candidate) => ({
    ...candidate,
    votes: voteCounts[candidate.id] || 0
  }));
}

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'nodifs-vote', timestamp: new Date().toISOString() });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};

  if (String(password || '').trim() !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe administrateur incorrect.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.add(token);

  res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
  return res.json({ token, message: 'Connexion administrateur réussie.' });
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ authenticated: true, message: 'Session admin active.' });
});

app.get('/api/election', (req, res) => {
  res.json({
    title: election.title,
    description: election.description,
    candidates: election.candidates,
    totalVotes: votesByStudent.size,
    results: []
  });
});

app.get('/api/results', requireAdmin, (req, res) => {
  res.json({
    title: election.title,
    totalVotes: votesByStudent.size,
    results: buildResults()
  });
});

app.get('/api/admin/voters', requireAdmin, (req, res) => {
  const votes = Array.from(votesByStudent.entries())
    .map(([studentId, candidateId]) => {
      const candidate = election.candidates.find((item) => item.id === candidateId);
      return {
        studentId,
        candidateId,
        candidateName: candidate ? candidate.name : 'Candidat inconnu'
      };
    })
    .sort((a, b) => a.studentId.localeCompare(b.studentId));

  res.json({
    totalVotes: votes.length,
    votes
  });
});

app.get('/api/admin/export/csv', requireAdmin, (req, res) => {
  const rows = buildResults();
  const header = 'Candidate,NumeroCandidat,Votes\n';
  const body = rows
    .map((candidate) => {
      const numeroCandidat = candidate.label || `Candidat N° ${String(candidate.id).replace('c', '')}`;
      return `${candidate.name},${numeroCandidat},${candidate.votes}`;
    })
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="election_results.csv"');
  res.send(`${header}${body}\n`);
});

app.post('/api/admin/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.admin_session || '';

  if (token) {
    adminTokens.delete(token);
  }

  res.setHeader('Set-Cookie', 'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.json({ message: 'Déconnexion admin réussie.' });
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  resetElectionState();
  return res.json({ message: 'Scrutin réinitialisé avec succès.' });
});

app.post('/api/admin/candidates', requireAdmin, upload.single('candidateImage'), (req, res) => {
  try {
    const candidateInput = {
      name: req.body.name || req.body.candidateName || '',
      label: req.body.label || req.body.candidateLabel || '',
      image: req.file ? `/images/${req.file.filename}` : (req.body.image || req.body.candidateImage || '')
    };

    const candidate = registerCandidate(candidateInput);
    return res.status(201).json({
      message: 'Candidat ajouté avec succès.',
      candidate
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Impossible d’ajouter le candidat.' });
  }
});

function isValidStudentId(studentId) {
  if (typeof studentId !== 'string') return false;
  const trimmed = studentId.trim();
  const validPattern = /^NV(0\d{3}|1[0-7]\d|180)$/;
  return validPattern.test(trimmed);
}

app.post('/api/vote', (req, res) => {
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

  const candidate = election.candidates.find((item) => item.id === safeCandidateId);

  if (!candidate) {
    return res.status(404).json({ error: 'Candidat introuvable.' });
  }

  if (votesByStudent.has(safeStudentId)) {
    return res.status(409).json({
      error: 'Vous avez déjà voté. Un seul vote est autorisé par élève.'
    });
  }

  votesByStudent.set(safeStudentId, safeCandidateId);
  voteCounts[safeCandidateId] += 1;

  return res.status(201).json({
    message: 'Votre vote a bien été enregistré.',
    candidate: candidate.name,
    results: []
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(port = process.env.PORT || 3000) {
  if (!ADMIN_PASSWORD) {
    return Promise.reject(new Error('La variable ADMIN_PASSWORD doit être définie en production.'));
  }

  initializeElectionState();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer, election, buildResults, ADMIN_PASSWORD };
