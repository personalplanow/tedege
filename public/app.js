'use strict';

const state = {
  token: localStorage.getItem('asap_token'),
  user: null,
  dashboard: null,
  bootstrap: null,
  section: 'dashboard',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const labels = {
  todo: 'Pendiente',
  in_progress: 'En progreso',
  review: 'En revisión',
  done: 'Finalizada',
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  critical: 'Crítico',
  admin: 'Administrador',
  leader: 'Líder',
  employee: 'Empleado',
  consultant: 'Analista',
  hr: 'Talento humano',
  director: 'Dirección',
};

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...extra,
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' ? payload.error : payload;
    throw new Error(message || 'Error en la solicitud.');
  }
  return payload;
}

function showLogin() {
  $('#loginView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
}

function showApp() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
}

function roleCanManage() {
  return ['admin', 'hr', 'leader', 'consultant'].includes(state.user?.role);
}

function roleCanSeeAudit() {
  return ['admin', 'hr', 'consultant'].includes(state.user?.role);
}

function updateRoleVisibility() {
  $$('.manager-only').forEach((el) => el.classList.toggle('hidden', !roleCanManage()));
  $$('.admin-only').forEach((el) => el.classList.toggle('hidden', !roleCanSeeAudit()));
}

async function init() {
  wireEvents();
  if (!state.token) return showLogin();
  try {
    const me = await api('/api/me');
    state.user = me.user;
    await loadAll();
    showApp();
  } catch (error) {
    console.warn(error);
    localStorage.removeItem('asap_token');
    state.token = null;
    showLogin();
  }
}

function wireEvents() {
  $('#loginForm').addEventListener('submit', onLogin);
  $$('.demo-users button').forEach((button) => {
    button.addEventListener('click', () => {
      const [email, password] = button.dataset.login.split('|');
      $('#email').value = email;
      $('#password').value = password;
    });
  });
  $('#logoutBtn').addEventListener('click', logout);
  $('#refreshBtn').addEventListener('click', loadAll);
  $$('.nav').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.section)));
  $('#taskForm').addEventListener('submit', createTask);
  $('#taskSearch').addEventListener('input', renderTasks);
  $('#statusFilter').addEventListener('change', renderTasks);
  $('#preferencesForm').addEventListener('submit', savePreferences);
  $('#resetDemoBtn').addEventListener('click', resetDemo);
  document.addEventListener('click', (event) => {
    const download = event.target.closest('[data-auth-download], #csvLink, #pdfLink');
    if (download) {
      event.preventDefault();
      downloadWithAuth(download.getAttribute('href'), download.id === 'pdfLink' || download.textContent.includes('PDF'));
    }
  });
}

async function onLogin(event) {
  event.preventDefault();
  $('#loginError').textContent = '';
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    const session = await api('/api/login', { method: 'POST', body: JSON.stringify(payload) });
    state.token = session.token;
    state.user = session.user;
    localStorage.setItem('asap_token', state.token);
    await loadAll();
    showApp();
  } catch (error) {
    $('#loginError').textContent = error.message;
  }
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
  localStorage.removeItem('asap_token');
  state.token = null;
  state.user = null;
  showLogin();
}

async function loadAll() {
  const [bootstrap, dashboard] = await Promise.all([
    api('/api/bootstrap'),
    api('/api/dashboard'),
  ]);
  state.bootstrap = bootstrap;
  state.dashboard = dashboard;
  state.user = bootstrap.currentUser;
  hydrateSelectors();
  renderAll();
}

function hydrateSelectors() {
  $('#sessionUser').textContent = `${state.user.name} · ${labels[state.user.role] || state.user.role}`;
  updateRoleVisibility();
  const teams = state.bootstrap.teams || [];
  $('#teamSelect').innerHTML = teams.map((team) => `<option value="${team.teamId || team.id}">${escapeHtml(team.name)}</option>`).join('');
  const users = state.dashboard.users || [];
  $('#assigneeSelect').innerHTML = `<option value="">Sugerir automáticamente</option>` + users.map((user) => `<option value="${user.userId}">${escapeHtml(user.name)} · ${user.utilizationPercent}%</option>`).join('');
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  $('#taskForm input[name="dueDate"]').value ||= nextWeek;
}

function renderAll() {
  renderCards();
  renderWorkload();
  renderTasks();
  renderRecommendations();
  renderProfile();
  if (roleCanSeeAudit()) renderAudit();
}

function setSection(section) {
  state.section = section;
  $$('.nav').forEach((button) => button.classList.toggle('active', button.dataset.section === section));
  $$('.section').forEach((el) => el.classList.toggle('active-section', el.id === section));
  $('#pageTitle').textContent = {
    dashboard: 'Dashboard',
    tasks: 'Tareas',
    recommendations: 'Alertas y recomendaciones',
    reports: 'Reportes',
    profile: 'Mi perfil',
    audit: 'Auditoría',
  }[section] || 'ASAP';
  if (section === 'audit' && roleCanSeeAudit()) renderAudit();
}

function renderCards() {
  const s = state.dashboard.summary;
  const cards = [
    ['Carga total ponderada', s.totalWorkload, 'CP acumulado de tareas abiertas'],
    ['Uso promedio', `${s.averageUtilizationPercent}%`, 'ICU global visible'],
    ['Tareas vencidas', s.overdueTasks, 'Riesgo operativo'],
    ['Recomendaciones', s.recommendations, 'Acciones sugeridas'],
  ];
  $('#cards').innerHTML = cards.map(([title, value, note]) => `
    <div class="metric-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small class="muted">${escapeHtml(note)}</small>
    </div>`).join('');
}

function renderWorkload() {
  const users = state.dashboard.users || [];
  $('#userWorkload').innerHTML = users.length ? users.map((user) => {
    const width = Math.min(user.utilizationPercent, 130);
    return `<div class="workload-row">
      <div class="workload-head">
        <div><strong>${escapeHtml(user.name)}</strong><span class="muted">${escapeHtml(labels[user.role] || user.role)} · ${user.openTasks} tareas abiertas</span></div>
        <span class="badge ${user.risk}">${escapeHtml(labels[user.risk] || user.risk)}</span>
      </div>
      <div class="bar"><span style="width:${width}%"></span></div>
      <div class="meta"><span>ICU ${user.utilizationPercent}%</span><span>CP ${user.workloadScore}</span><span>Capacidad ${user.capacityHoursPerWeek}h</span><span>Vencidas ${user.overdueTasks}</span></div>
    </div>`;
  }).join('') : empty();

  const teams = state.dashboard.teams || [];
  $('#teamWorkload').innerHTML = teams.length ? teams.map((team) => `<div class="team-row">
    <div class="workload-head"><strong>${escapeHtml(team.name)}</strong><span class="badge ${team.utilizationPercent >= 85 ? 'high' : 'low'}">${team.utilizationPercent}%</span></div>
    <div class="bar"><span style="width:${Math.min(team.utilizationPercent, 130)}%"></span></div>
    <div class="meta"><span>${team.members} miembros</span><span>${team.openTasks} tareas</span><span>${team.overdueTasks} vencidas</span><span>CP ${team.workloadScore}</span></div>
  </div>`).join('') : empty();
}

function renderTasks() {
  let tasks = state.dashboard.tasks || [];
  const search = $('#taskSearch').value.trim().toLowerCase();
  const status = $('#statusFilter').value;
  if (status) tasks = tasks.filter((task) => task.status === status);
  if (search) {
    tasks = tasks.filter((task) => `${task.title} ${task.description} ${task.assigneeName} ${task.teamName}`.toLowerCase().includes(search));
  }
  $('#taskCount').textContent = `${tasks.length} tareas`;
  $('#taskList').innerHTML = tasks.length ? tasks.map(renderTaskCard).join('') : empty();
  $$('#taskList [data-action]').forEach((button) => button.addEventListener('click', () => updateTaskStatus(button.dataset.task, button.dataset.action)));
}

function renderTaskCard(task) {
  const canUpdate = state.user.role !== 'employee' || task.assigneeId === state.user.id;
  const actions = canUpdate ? `
    <div class="task-actions">
      ${task.status !== 'in_progress' ? `<button class="ghost" data-task="${task.id}" data-action="in_progress">Iniciar</button>` : ''}
      ${task.status !== 'review' ? `<button class="ghost" data-task="${task.id}" data-action="review">Enviar a revisión</button>` : ''}
      ${task.status !== 'done' ? `<button class="primary" data-task="${task.id}" data-action="done">Finalizar</button>` : ''}
    </div>` : '';
  return `<article class="task-card">
    <div class="task-head">
      <div><strong>${escapeHtml(task.title)}</strong><span class="muted">${escapeHtml(task.teamName)} · ${escapeHtml(task.assigneeName)}</span></div>
      <span class="badge ${task.risk}">${escapeHtml(labels[task.risk] || task.risk)}</span>
    </div>
    <p>${escapeHtml(task.description)}</p>
    <div class="meta">
      <span>Estado: ${escapeHtml(labels[task.status] || task.status)}</span>
      <span>Prioridad: ${escapeHtml(labels[task.priority] || task.priority)}</span>
      <span>Dificultad: ${escapeHtml(labels[task.difficulty] || task.difficulty)}</span>
      <span>Vence: ${escapeHtml(task.dueDate || 'Sin fecha')}</span>
      <span>CP: ${task.workloadScore}</span>
      <span>Comentarios: ${task.commentsCount}</span>
    </div>
    ${actions}
  </article>`;
}

async function updateTaskStatus(taskId, status) {
  try {
    await api(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
}

async function createTask(event) {
  event.preventDefault();
  $('#taskFormMsg').textContent = 'Creando tarea...';
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    if (!payload.assigneeId) delete payload.assigneeId;
    const result = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    $('#taskFormMsg').textContent = `Tarea creada y asignada a ${result.task.assigneeId}.`;
    event.target.reset();
    await loadAll();
  } catch (error) {
    $('#taskFormMsg').textContent = error.message;
  }
}

function renderRecommendations() {
  const list = state.dashboard.recommendations || [];
  $('#recommendationList').innerHTML = list.length ? list.map((rec) => {
    const apply = rec.type === 'REASSIGN_TASK' && roleCanManage()
      ? `<button class="primary" data-rec="${rec.id}">Aplicar reasignación</button>`
      : '';
    return `<article class="recommendation-card ${rec.severity || 'preventive'}">
      <div class="recommendation-head">
        <div><strong>${escapeHtml(rec.taskTitle || rec.type)}</strong><span class="muted">${escapeHtml(rec.type)}</span></div>
        <span class="badge ${rec.severity || 'medium'}">${escapeHtml(labels[rec.severity] || rec.severity || 'medio')}</span>
      </div>
      ${rec.toUserName ? `<p>Reasignar de <strong>${escapeHtml(rec.fromUserName)}</strong> a <strong>${escapeHtml(rec.toUserName)}</strong>. Confianza: ${Math.round((rec.confidence || 0) * 100)}%.</p>` : ''}
      <ul>${(rec.explanation || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <div class="recommendation-actions">${apply}</div>
    </article>`;
  }).join('') : empty();
  $$('#recommendationList [data-rec]').forEach((button) => button.addEventListener('click', () => applyRecommendation(button.dataset.rec)));
}

async function applyRecommendation(id) {
  if (!confirm('¿Aplicar esta recomendación? La acción quedará registrada en auditoría.')) return;
  try {
    await api(`/api/recommendations/${encodeURIComponent(id)}/apply`, { method: 'POST' });
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderProfile() {
  const user = state.user;
  $('#profileInfo').innerHTML = `
    <div class="profile-line"><strong>Nombre</strong><span>${escapeHtml(user.name)}</span></div>
    <div class="profile-line"><strong>Correo</strong><span>${escapeHtml(user.email)}</span></div>
    <div class="profile-line"><strong>Rol</strong><span>${escapeHtml(labels[user.role] || user.role)}</span></div>
    <div class="profile-line"><strong>Propósito</strong><span>Apoyo a la decisión, no vigilancia individual ni sanción automática.</span></div>`;
  const form = $('#preferencesForm');
  form.notifications.checked = Boolean(user.preferences?.notifications);
  form.googleCalendarConnected.checked = Boolean(user.preferences?.googleCalendarConnected);
}

async function savePreferences(event) {
  event.preventDefault();
  const form = event.target;
  const payload = {
    notifications: form.notifications.checked,
    googleCalendarConnected: form.googleCalendarConnected.checked,
  };
  try {
    await api('/api/profile/preferences', { method: 'PATCH', body: JSON.stringify(payload) });
    $('#preferencesMsg').textContent = 'Preferencias guardadas.';
    await loadAll();
  } catch (error) {
    $('#preferencesMsg').textContent = error.message;
  }
}

async function renderAudit() {
  try {
    const { audit } = await api('/api/audit');
    $('#auditLog').innerHTML = audit.length ? audit.map((event) => `<div class="audit-item">
      <strong>${escapeHtml(event.action)}</strong> · <span class="muted">${escapeHtml(event.actorName)} · ${new Date(event.createdAt).toLocaleString()}</span><br>
      <code>${escapeHtml(event.entity)}:${escapeHtml(event.entityId)}</code> ${event.note ? escapeHtml(event.note) : ''}
    </div>`).join('') : empty();
  } catch (error) {
    $('#auditLog').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
}

async function resetDemo() {
  if (!confirm('Esto restaurará los datos de demostración y cerrará la sesión actual.')) return;
  try {
    await api('/api/reset-demo', { method: 'POST' });
    await logout();
  } catch (error) {
    alert(error.message);
  }
}

async function downloadWithAuth(path, openInNewTab = false) {
  try {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (openInNewTab) {
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = path.endsWith('.csv') ? 'asap-cargas-laborales.csv' : 'asap-reporte.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    alert(`No se pudo descargar el reporte: ${error.message}`);
  }
}

function empty() {
  return $('#emptyTemplate').innerHTML;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

init();
