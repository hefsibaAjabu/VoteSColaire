const electionTitle = document.getElementById('election-title');
const resultsList = document.getElementById('results-list');
const resultSummary = document.getElementById('result-summary');
const candidateList = document.getElementById('candidate-list');
const form = document.getElementById('vote-form');
const formMessage = document.getElementById('form-message');
const toggleResultsButton = document.getElementById('toggle-results');
const resultsPanel = document.getElementById('results-panel');
const adminLoginButton = document.getElementById('admin-login-btn');
const adminPasswordInput = document.getElementById('adminPassword');
const adminResultsBox = document.getElementById('admin-results-box');
const adminLoginBox = document.getElementById('admin-login-box');
const exportCsvButton = document.getElementById('export-csv-btn');
const voterCountElement = document.getElementById('voter-count');
const validatedCountElement = document.getElementById('validated-count');
const votersList = document.getElementById('voters-list');

let resultsVisible = false;
let adminToken = '';

function isValidStudentId(studentId) {
  if (typeof studentId !== 'string') return false;
  const trimmed = studentId.trim();
  const validPattern = /^NV0(?:00[1-9]|0[1-9]\d|1[0-7]\d|180)$/;
  return validPattern.test(trimmed);
}

function updateResultsVisibility() {
  if (!resultsPanel || !toggleResultsButton) return;
  resultsPanel.classList.toggle('hidden', !resultsVisible);
  toggleResultsButton.textContent = resultsVisible ? 'Masquer les résultats' : 'Afficher les résultats';
}

function setAdminLoggedIn(token = 'session') {
  if (!adminLoginBox || !adminResultsBox) return;
  adminToken = token;
  adminLoginBox.classList.add('hidden');
  adminResultsBox.classList.remove('hidden');
  loadAdminResults();
  loadAdminDashboard();
}

async function restoreAdminSession() {
  if (!adminLoginBox || !adminResultsBox) return;

  const response = await fetch('/api/admin/session', { credentials: 'same-origin' });

  if (response.ok) {
    setAdminLoggedIn();
    formMessage.textContent = 'Session admin restaurée.';
    formMessage.classList.add('success');
  }
}

async function loadElection() {
  const response = await fetch('/api/election');
  const data = await response.json();

  if (electionTitle) {
    electionTitle.textContent = data.title;
  }

  if (resultSummary) {
    resultSummary.textContent = `${data.totalVotes} vote(s) enregistré(s)`;
  }

  if (candidateList) {
    candidateList.innerHTML = data.candidates
      .map(
        (candidate) => `
          <label class="candidate-option">
            <input type="radio" name="candidateId" value="${candidate.id}" required />
            ${candidate.image
              ? `<div class="candidate-visual"><img src="${candidate.image}" alt="${candidate.name}" class="candidate-photo" /></div>`
              : `<div class="candidate-visual candidate-visual-empty"><span>Photo</span></div>`}
            <div class="candidate-copy">
              <strong>${candidate.name}</strong>
              <span class="candidate-number">${candidate.label || `Candidat N° ${candidate.id.replace('c', '')}`}</span>
            </div>
          </label>
        `
      )
      .join('');
  }

  if (resultsList) {
    renderResults(data.results);
  }
}

function renderResults(results) {
  const sortedResults = [...results].sort((a, b) => b.votes - a.votes);
  const maxVotes = sortedResults[0]?.votes || 0;

  resultsList.innerHTML = sortedResults
    .map((candidate) => {
      const isLeader = candidate.votes === maxVotes && maxVotes > 0;
      return `
        <li class="result-item">
          <div class="result-meta">
            <strong>${candidate.name}</strong>
            <span>${candidate.grade}</span>
          </div>
          <span class="result-badge">${candidate.votes} ${isLeader ? '🟢' : ''}</span>
        </li>
      `;
    })
    .join('');
}

async function loadAdminResults() {
  if (!adminToken) {
    resultsPanel.classList.add('hidden');
    return;
  }

  const response = await fetch('/api/results', {
    credentials: 'same-origin',
    headers: {
      ...(adminToken ? { 'x-admin-token': adminToken } : {})
    }
  });

  if (!response.ok) {
    formMessage.textContent = 'Accès administrateur refusé.';
    formMessage.classList.add('error');
    return;
  }

  const data = await response.json();
  resultSummary.textContent = `${data.totalVotes} vote(s) enregistré(s)`;
  renderResults(data.results);
}

async function loadAdminDashboard() {
  if (!adminToken) {
    votersList.innerHTML = '';
    voterCountElement.textContent = '0';
    validatedCountElement.textContent = '0';
    return;
  }

  const response = await fetch('/api/admin/voters', {
    credentials: 'same-origin',
    headers: {
      ...(adminToken ? { 'x-admin-token': adminToken } : {})
    }
  });

  if (!response.ok) {
    return;
  }

  const data = await response.json();
  voterCountElement.textContent = String(data.totalVotes || 0);
  validatedCountElement.textContent = String(data.totalVotes || 0);

  if (!data.votes || data.votes.length === 0) {
    votersList.innerHTML = '<li><span>Aucun vote enregistré.</span></li>';
    return;
  }

  votersList.innerHTML = data.votes
    .map(
      (vote) => `
        <li>
          <strong>${vote.studentId}</strong>
          <span>${vote.candidateName}</span>
        </li>
      `
    )
    .join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const studentId = String(formData.get('studentId') || '').trim();
  const payload = {
    studentId,
    candidateId: formData.get('candidateId')
  };

  formMessage.className = 'message';

  if (!isValidStudentId(studentId)) {
    formMessage.textContent = 'Identifiant invalide.';
    formMessage.classList.add('error');
    return;
  }

  try {
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Une erreur est survenue.');
    }

    formMessage.textContent = result.message;
    formMessage.classList.add('success');
    form.reset();
    await loadElection();
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.classList.add('error');
  }
});

if (adminLoginButton && adminPasswordInput) {
  adminLoginButton.addEventListener('click', async () => {
    const password = adminPasswordInput.value.trim();

    if (!password) {
      formMessage.textContent = 'Le mot de passe admin est requis.';
      formMessage.classList.add('error');
      return;
    }

    const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (!response.ok) {
      formMessage.textContent = data.error || 'Impossible de se connecter.';
      formMessage.classList.add('error');
      return;
    }

    setAdminLoggedIn(data.token);
    formMessage.textContent = data.message;
    formMessage.classList.add('success');
    adminPasswordInput.value = '';
  });
}

if (exportCsvButton) {
  exportCsvButton.addEventListener('click', async () => {
    if (!adminToken) {
      formMessage.textContent = 'Connectez-vous en tant qu’administrateur pour exporter les résultats.';
      formMessage.classList.add('error');
      return;
    }

    window.location.href = '/api/admin/export/csv';
  });
}

if (toggleResultsButton) {
  toggleResultsButton.addEventListener('click', () => {
    if (!adminToken) {
      return;
    }

    resultsVisible = !resultsVisible;
    updateResultsVisibility();
  });
}

updateResultsVisibility();
if (adminLoginBox && adminResultsBox) {
  restoreAdminSession();
}
loadElection();
