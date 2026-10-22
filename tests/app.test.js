const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../server.js');

test('health endpoint returns 200', async () => {
  const server = await startServer(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ok');
  } finally {
    server.close();
  }
});

test('results stay hidden without admin access', async () => {
  const server = await startServer(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/election`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.results, []);
  } finally {
    server.close();
  }
});

test('admin can authenticate and view results', async () => {
  const server = await startServer(0);
  const { port } = server.address();

  try {
    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' })
    });

    const loginPayload = await loginResponse.json();
    assert.equal(loginResponse.status, 200);
    assert.ok(loginPayload.token);

    const resultsResponse = await fetch(`http://127.0.0.1:${port}/api/results`, {
      headers: { 'x-admin-token': loginPayload.token }
    });

    const resultsPayload = await resultsResponse.json();

    assert.equal(resultsResponse.status, 200);
    assert.ok(Array.isArray(resultsPayload.results));
  } finally {
    server.close();
  }
});

test('admin can export results as CSV', async () => {
  const server = await startServer(0);
  const { port } = server.address();

  try {
    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' })
    });

    const loginPayload = await loginResponse.json();
    const exportResponse = await fetch(`http://127.0.0.1:${port}/api/admin/export/csv`, {
      headers: { 'x-admin-token': loginPayload.token }
    });

    const csvText = await exportResponse.text();

    assert.equal(exportResponse.status, 200);
    assert.ok(csvText.includes('Candidate'));
    assert.ok(csvText.includes('Votes'));
  } finally {
    server.close();
  }
});

test('admin session persists through cookie authentication', async () => {
  const server = await startServer(0);
  const { port } = server.address();

  try {
    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' })
    });

    const cookie = loginResponse.headers.get('set-cookie');
    assert.ok(cookie && cookie.includes('admin_session='));

    const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/admin/session`, {
      headers: { Cookie: cookie.split(';')[0] }
    });

    const sessionPayload = await sessionResponse.json();

    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionPayload.authenticated, true);
  } finally {
    server.close();
  }
});

test('admin dashboard lists voter ids and selected candidates', async () => {
  const server = await startServer(0);
  const { port } = server.address();

  try {
    await fetch(`http://127.0.0.1:${port}/api/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'NV0001', candidateId: 'c2' })
    });

    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' })
    });

    const loginPayload = await loginResponse.json();
    const votersResponse = await fetch(`http://127.0.0.1:${port}/api/admin/voters`, {
      headers: { 'x-admin-token': loginPayload.token }
    });

    const voters = await votersResponse.json();

    assert.equal(votersResponse.status, 200);
    assert.ok(Array.isArray(voters.votes));
    assert.ok(voters.votes.some((vote) => vote.studentId === 'NV0001' && vote.candidateId === 'c2'));
  } finally {
    server.close();
  }
});

test('admin can add a new candidate to the election with a file upload', async () => {
  const server = await startServer(0);
  const { port } = server.address();

  try {
    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' })
    });

    const loginPayload = await loginResponse.json();
    const formData = new FormData();
    formData.set('name', 'MUTONI Grace');
    formData.set('label', 'Candidat N° 4');
    formData.set('candidateImage', new Blob(['fake-image-data'], { type: 'image/png' }), 'mutoni.png');

    const addCandidateResponse = await fetch(`http://127.0.0.1:${port}/api/admin/candidates`, {
      method: 'POST',
      headers: {
        'x-admin-token': loginPayload.token
      },
      body: formData
    });

    const addCandidatePayload = await addCandidateResponse.json();
    const electionResponse = await fetch(`http://127.0.0.1:${port}/api/election`);
    const electionPayload = await electionResponse.json();

    assert.equal(addCandidateResponse.status, 201);
    assert.equal(addCandidatePayload.candidate.name, 'MUTONI Grace');
    assert.ok(addCandidatePayload.candidate.image.startsWith('/images/'));
    assert.ok(electionPayload.candidates.some((candidate) => candidate.name === 'MUTONI Grace'));
  } finally {
    server.close();
  }
});

test('admin can reset all votes and restart the election', async () => {
  const server = await startServer(0);
  const { port } = server.address();

  try {
    await fetch(`http://127.0.0.1:${port}/api/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'NV0002', candidateId: 'c1' })
    });

    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' })
    });

    const loginPayload = await loginResponse.json();
    const resetResponse = await fetch(`http://127.0.0.1:${port}/api/admin/reset`, {
      method: 'POST',
      headers: { 'x-admin-token': loginPayload.token }
    });

    const resetPayload = await resetResponse.json();
    const resultsResponse = await fetch(`http://127.0.0.1:${port}/api/results`, {
      headers: { 'x-admin-token': loginPayload.token }
    });

    const resultsPayload = await resultsResponse.json();

    assert.equal(resetResponse.status, 200);
    assert.equal(resetPayload.message, 'Scrutin réinitialisé avec succès.');
    assert.equal(resultsPayload.totalVotes, 0);
    assert.deepEqual(resultsPayload.results.map((item) => item.votes), [0, 0, 0]);
  } finally {
    server.close();
  }
});
