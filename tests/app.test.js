const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, defaultCandidates } = require('../server.js');

class MemoryElectionStore {
  constructor() {
    this.state = null;
    this.images = new Map();
  }

  async connect() {}

  async initialize() {
    if (!this.state) {
      this.state = {
        title: 'Vote des élèves du secondaire',
        description: 'Élection des représentants de classe et des délégués de l’établissement.',
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
    this.state.candidates = defaultCandidates.map((candidate) => ({ ...candidate }));
    this.state.votes = [];
    this.state.candidateSequence = defaultCandidates.length;
  }

  async close() {}
}

async function startTestServer(store = new MemoryElectionStore()) {
  const server = await startServer(0, { store, adminPassword: 'admin123' });
  const { port } = server.address();
  return {
    server,
    store,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' })
  });
  return { response, payload: await response.json() };
}

test('health endpoint confirms database connectivity', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ok');
  } finally {
    await closeServer(server);
  }
});

test('results stay hidden without admin access', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/election`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.results, []);
  } finally {
    await closeServer(server);
  }
});

test('admin can authenticate and view results', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const { response: loginResponse, payload: loginPayload } = await login(baseUrl);
    assert.equal(loginResponse.status, 200);
    assert.ok(loginPayload.token);

    const resultsResponse = await fetch(`${baseUrl}/api/results`, {
      headers: { 'x-admin-token': loginPayload.token }
    });
    const resultsPayload = await resultsResponse.json();

    assert.equal(resultsResponse.status, 200);
    assert.ok(Array.isArray(resultsPayload.results));
  } finally {
    await closeServer(server);
  }
});

test('admin can export results as CSV', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const { payload } = await login(baseUrl);
    const exportResponse = await fetch(`${baseUrl}/api/admin/export/csv`, {
      headers: { 'x-admin-token': payload.token }
    });
    const csvText = await exportResponse.text();

    assert.equal(exportResponse.status, 200);
    assert.ok(csvText.includes('Candidate'));
    assert.ok(csvText.includes('Votes'));
  } finally {
    await closeServer(server);
  }
});

test('admin session persists through cookie authentication', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const { response, payload } = await login(baseUrl);
    const cookie = response.headers.get('set-cookie');
    assert.ok(cookie && cookie.includes('admin_session='));

    const sessionResponse = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { Cookie: cookie.split(';')[0] }
    });
    const sessionPayload = await sessionResponse.json();

    assert.ok(payload.token);
    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionPayload.authenticated, true);
  } finally {
    await closeServer(server);
  }
});

test('admin dashboard lists voter ids and selected candidates', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await fetch(`${baseUrl}/api/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'NV0001', candidateId: 'c2' })
    });

    const { payload } = await login(baseUrl);
    const votersResponse = await fetch(`${baseUrl}/api/admin/voters`, {
      headers: { 'x-admin-token': payload.token }
    });
    const voters = await votersResponse.json();

    assert.equal(votersResponse.status, 200);
    assert.ok(Array.isArray(voters.votes));
    assert.ok(voters.votes.some((vote) => vote.studentId === 'NV0001' && vote.candidateId === 'c2'));
  } finally {
    await closeServer(server);
  }
});

test('admin can add a candidate and persist its uploaded image', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const { payload } = await login(baseUrl);
    const formData = new FormData();
    formData.set('name', 'MUTONI Grace');
    formData.set('label', 'Candidat N° 4');
    formData.set('candidateImage', new Blob(['fake-image-data'], { type: 'image/png' }), 'mutoni.png');

    const addResponse = await fetch(`${baseUrl}/api/admin/candidates`, {
      method: 'POST',
      headers: { 'x-admin-token': payload.token },
      body: formData
    });
    const addPayload = await addResponse.json();
    const electionResponse = await fetch(`${baseUrl}/api/election`);
    const electionPayload = await electionResponse.json();
    const imageResponse = await fetch(`${baseUrl}${addPayload.candidate.image}`);

    assert.equal(addResponse.status, 201);
    assert.equal(addPayload.candidate.name, 'MUTONI Grace');
    assert.ok(addPayload.candidate.image.startsWith('/api/images/'));
    assert.ok(electionPayload.candidates.some((candidate) => candidate.name === 'MUTONI Grace'));
    assert.equal(imageResponse.status, 200);
    assert.equal(await imageResponse.text(), 'fake-image-data');
  } finally {
    await closeServer(server);
  }
});

test('admin can reset all votes and restart the election', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await fetch(`${baseUrl}/api/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'NV0002', candidateId: 'c1' })
    });

    const { payload } = await login(baseUrl);
    const resetResponse = await fetch(`${baseUrl}/api/admin/reset`, {
      method: 'POST',
      headers: { 'x-admin-token': payload.token }
    });
    const resetPayload = await resetResponse.json();
    const resultsResponse = await fetch(`${baseUrl}/api/results`, {
      headers: { 'x-admin-token': payload.token }
    });
    const resultsPayload = await resultsResponse.json();

    assert.equal(resetResponse.status, 200);
    assert.equal(resetPayload.message, 'Scrutin réinitialisé avec succès.');
    assert.equal(resultsPayload.totalVotes, 0);
    assert.deepEqual(resultsPayload.results.map((item) => item.votes), [0, 0, 0]);
  } finally {
    await closeServer(server);
  }
});

test('votes and candidates remain available after the server restarts', async () => {
  const store = new MemoryElectionStore();
  const first = await startTestServer(store);

  await fetch(`${first.baseUrl}/api/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: 'NV0003', candidateId: 'c1' })
  });
  const { payload } = await login(first.baseUrl);
  const formData = new FormData();
  formData.set('name', 'Candidate Persistant');
  await fetch(`${first.baseUrl}/api/admin/candidates`, {
    method: 'POST',
    headers: { 'x-admin-token': payload.token },
    body: formData
  });
  await closeServer(first.server);

  const second = await startTestServer(store);
  try {
    const electionResponse = await fetch(`${second.baseUrl}/api/election`);
    const electionPayload = await electionResponse.json();
    const { payload: secondLogin } = await login(second.baseUrl);
    const resultsResponse = await fetch(`${second.baseUrl}/api/results`, {
      headers: { 'x-admin-token': secondLogin.token }
    });
    const resultsPayload = await resultsResponse.json();

    assert.equal(electionPayload.totalVotes, 1);
    assert.ok(electionPayload.candidates.some((candidate) => candidate.name === 'Candidate Persistant'));
    assert.equal(resultsPayload.results[0].votes, 1);
  } finally {
    await closeServer(second.server);
  }
});

test('a student cannot vote more than once', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const vote = () => fetch(`${baseUrl}/api/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'NV0004', candidateId: 'c1' })
    });

    assert.equal((await vote()).status, 201);
    assert.equal((await vote()).status, 409);
  } finally {
    await closeServer(server);
  }
});
