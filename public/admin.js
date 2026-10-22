const adminPasswordInput = document.getElementById('adminPassword');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminMessage = document.getElementById('admin-message');
const adminLoginSection = document.getElementById('admin-login-section');
const adminDashboardSection = document.getElementById('admin-dashboard-section');
const voterCountElement = document.getElementById('voter-count');
const validatedCountElement = document.getElementById('validated-count');
const leaderNameElement = document.getElementById('leader-name');
const leaderVotesElement = document.getElementById('leader-votes');
const participationRateElement = document.getElementById('participation-rate');
const resultSummary = document.getElementById('result-summary');
const resultsList = document.getElementById('results-list');
const toggleResultsButton = document.getElementById('toggle-results');
const resultsPanel = document.getElementById('results-panel');
const votersList = document.getElementById('voters-list');
const votersListExtended = document.getElementById('voters-list-extended');
const candidateSummaryList = document.getElementById('candidate-summary-list');
const addCandidateForm = document.getElementById('add-candidate-form');
const candidateFormMessage = document.getElementById('candidate-form-message');
const exportCsvButton = document.getElementById('export-csv-btn');
const resetElectionButton = document.getElementById('reset-election-btn');
const logoutButton = document.getElementById('admin-logout-btn');
const backToVoteButton = document.getElementById('back-to-vote-btn');
const sidebar = document.querySelector('.admin-sidebar');
const navButtons = document.querySelectorAll('.nav-item');
const navPanels = document.querySelectorAll('.nav-panel');

let resultsVisible = false;

function showMessage(message, type = 'success') {
  adminMessage.textContent = message;
  adminMessage.className = `message ${type}`;
}

function switchNav(viewName) {
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });

  navPanels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.panel !== viewName);
    panel.classList.toggle('active', panel.dataset.panel === viewName);
  });
}

function showDashboard() {
  adminLoginSection.classList.add('hidden');
  adminDashboardSection.classList.remove('hidden');
  if (sidebar) sidebar.classList.remove('hidden');
  switchNav('overview');
  loadAdminDetails();
}

function showLogin() {
  adminLoginSection.classList.remove('hidden');
  adminDashboardSection.classList.add('hidden');
  if (sidebar) sidebar.classList.add('hidden');
  adminPasswordInput.value = '';
  if (resultsPanel) {
    resultsPanel.classList.add('hidden');
  }
  resultsVisible = false;
  if (toggleResultsButton) {
    toggleResultsButton.textContent = 'Afficher les résultats';
  }
}

function getLeaderData(results) {
  const sorted = [...results].sort((a, b) => b.votes - a.votes);
  const leader = sorted[0] || null;
  return { sorted, leader, maxVotes: leader ? leader.votes : 0 };
}

function renderOverviewCharts(results) {
  const sorted = [...results].sort((a, b) => b.votes - a.votes);
  const totalVotes = sorted.reduce((sum, item) => sum + item.votes, 0) || 1;

  const voteChart = document.getElementById('vote-chart');
  if (voteChart) {
    voteChart.innerHTML = sorted
      .map((candidate) => {
        const percentage = Math.round((candidate.votes / totalVotes) * 100);
        return `
          <div class="chart-row">
            <div class="chart-row-head">
              <span>${candidate.name}</span>
              <strong>${candidate.votes}</strong>
            </div>
            <div class="chart-bar-track">
              <span style="width:${percentage}%"></span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  const ring = document.getElementById('participation-ring');
  const ringValue = document.getElementById('ring-value');
  const participation = Math.min(Math.round((totalVotes / Math.max(results.length || 1, 1)) * 100), 100);

  if (ring) {
    ring.style.background = `conic-gradient(#2148c0 0 ${participation}%, #dfe7f5 ${participation}% 100%)`;
  }

  if (ringValue) {
    ringValue.textContent = `${participation}%`;
  }
}

function renderResults(results) {
  const { sorted, leader, maxVotes } = getLeaderData(results);
  const totalVotes = sorted.reduce((sum, item) => sum + item.votes, 0) || 1;

  resultsList.innerHTML = sorted
    .map((candidate) => {
      const isLeader = leader && candidate.id === leader.id && maxVotes > 0;
      const percentage = totalVotes === 0 ? 0 : Math.round((candidate.votes / totalVotes) * 100);
      const candidateNumber = candidate.label || `Candidat N° ${candidate.id.replace('c', '')}`;
      return `
        <div class="result-item ${isLeader ? 'leader-item' : ''}">
          <div class="result-meta">
            <div class="result-header">
              <strong>${candidate.name}</strong>
              ${isLeader ? '<span class="leader-pill">Leader</span>' : ''}
            </div>
            <span>${candidateNumber}</span>
          </div>
          <div class="result-score-box">
            <span class="result-badge">${candidate.votes}</span>
            <small>${percentage}%</small>
          </div>
          <div class="progress-track">
            <span style="width: ${percentage}%"></span>
          </div>
        </div>
      `;
    })
    .join('');

  renderOverviewCharts(sorted);

  if (candidateSummaryList) {
    candidateSummaryList.innerHTML = sorted
      .map((candidate) => {
        const percentage = totalVotes === 0 ? 0 : Math.round((candidate.votes / totalVotes) * 100);
        return `
          <div class="candidate-summary-item">
            <div class="candidate-summary-head">
              <strong>${candidate.name}</strong>
              <span>${candidate.votes} voix</span>
            </div>
            <div class="mini-progress-bar"><span style="width:${percentage}%"></span></div>
            <small>${percentage}% des votes</small>
          </div>
        `;
      })
      .join('');
  }

  if (!leader) {
    leaderNameElement.textContent = '—';
    leaderVotesElement.textContent = '0 voix';
    return;
  }

  leaderNameElement.textContent = leader.name;
  leaderVotesElement.textContent = `${leader.votes} voix`;
}

function renderVoters(votes) {
  const renderRows = (listElement, data) => {
    if (!listElement) return;

    if (!data || data.length === 0) {
      listElement.innerHTML = `
        <tr>
          <td colspan="2" class="empty-state">Aucun vote enregistré.</td>
        </tr>
      `;
      return;
    }

    listElement.innerHTML = data
      .map(
        (vote) => `
          <tr>
            <td>${vote.studentId}</td>
            <td>${vote.candidateName}</td>
          </tr>
        `
      )
      .join('');
  };

  renderRows(votersList, votes);
  renderRows(votersListExtended, votes);
}

async function loadAdminDetails() {
  const response = await fetch('/api/results', {
    credentials: 'same-origin'
  });

  if (!response.ok) {
    showMessage('Session admin expirée. Veuillez vous reconnecter.', 'error');
    showLogin();
    return;
  }

  const data = await response.json();
  const totalVotes = Number(data.totalVotes || 0);
  const { leader } = getLeaderData(data.results || []);
  const participation = Math.min(totalVotes * 100, 100);

  resultSummary.textContent = `${totalVotes} vote(s) enregistré(s)`;
  voterCountElement.textContent = String(totalVotes);
  validatedCountElement.textContent = String(totalVotes);
  participationRateElement.textContent = `${participation}%`;

  const activityVoteTotal = document.getElementById('vote-total-activity');
  const activityVoteValid = document.getElementById('vote-valid-activity');
  const activityVoteParticipation = document.getElementById('vote-participation-activity');

  if (activityVoteTotal) activityVoteTotal.textContent = String(totalVotes);
  if (activityVoteValid) activityVoteValid.textContent = String(totalVotes);
  if (activityVoteParticipation) activityVoteParticipation.textContent = `${participation}%`;

  renderResults(data.results || []);

  const votersResponse = await fetch('/api/admin/voters', {
    credentials: 'same-origin'
  });

  if (!votersResponse.ok) {
    return;
  }

  const votersData = await votersResponse.json();
  renderVoters(votersData.votes || []);

  if (leader) {
    leaderNameElement.textContent = leader.name;
    leaderVotesElement.textContent = `${leader.votes} voix`;
  }
}

async function loginAdmin() {
  const password = adminPasswordInput.value.trim();

  if (!password) {
    showMessage('Veuillez entrer le mot de passe admin.', 'error');
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
    showMessage(data.error || 'Mot de passe incorrect.', 'error');
    return;
  }

  showMessage(data.message, 'success');
  showDashboard();
}

async function logoutAdmin() {
  await fetch('/api/admin/logout', {
    method: 'POST',
    credentials: 'same-origin'
  });

  showLogin();
  showMessage('Déconnexion réussie.', 'success');
}

adminLoginBtn.addEventListener('click', loginAdmin);
logoutButton.addEventListener('click', logoutAdmin);

resetElectionButton.addEventListener('click', async () => {
  const confirmed = window.confirm('Voulez-vous vraiment réinitialiser tout le scrutin ? Cela effacera tous les votes enregistrés.');
  if (!confirmed) return;

  const response = await fetch('/api/admin/reset', {
    method: 'POST',
    credentials: 'same-origin'
  });

  const data = await response.json();

  if (!response.ok) {
    showMessage(data.error || 'Impossible de réinitialiser le scrutin.', 'error');
    return;
  }

  showMessage(data.message, 'success');
  await loadAdminDetails();
});

if (backToVoteButton) {
  backToVoteButton.addEventListener('click', () => {
    window.location.href = '/';
  });
}

exportCsvButton.addEventListener('click', () => {
  window.location.href = '/api/admin/export/csv';
});

toggleResultsButton.addEventListener('click', () => {
  resultsVisible = !resultsVisible;
  resultsPanel.classList.toggle('hidden', !resultsVisible);
  toggleResultsButton.textContent = resultsVisible ? 'Masquer les résultats' : 'Afficher les résultats';
});

if (addCandidateForm) {
  addCandidateForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(addCandidateForm);
    const name = String(formData.get('candidateName') || '').trim();
    const label = String(formData.get('candidateLabel') || '').trim();
    const imageFile = formData.get('candidateImage');

    if (!name || !label) {
      candidateFormMessage.textContent = 'Le nom et le libellé du candidat sont obligatoires.';
      candidateFormMessage.className = 'message error';
      return;
    }

    if (imageFile && imageFile.size === 0) {
      candidateFormMessage.textContent = 'Veuillez sélectionner une photo valide.';
      candidateFormMessage.className = 'message error';
      return;
    }

    const response = await fetch('/api/admin/candidates', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      candidateFormMessage.textContent = data.error || 'Impossible d’ajouter le candidat.';
      candidateFormMessage.className = 'message error';
      return;
    }

    candidateFormMessage.textContent = data.message;
    candidateFormMessage.className = 'message success';
    addCandidateForm.reset();
    await loadAdminDetails();
  });
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => switchNav(button.dataset.view));
});

async function checkExistingSession() {
  showLogin();
}

window.addEventListener('pageshow', (event) => {
  const isCacheRestore = event.persisted || (performance.getEntriesByType('navigation')[0] && performance.getEntriesByType('navigation')[0].type === 'back_forward');

  if (isCacheRestore || document.visibilityState === 'visible') {
    showLogin();
  }
});

window.addEventListener('popstate', () => {
  showLogin();
});

checkExistingSession();
