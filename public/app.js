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
  closed: 'Cerrado',
  preventive: 'Preventivo',
  admin: 'Administrador',
  leader: 'Líder',
  employee: 'Empleado',
  consultant: 'Analista',
  hr: 'Talento humano',
  director: 'Dirección',
};

const metricDefinitions = [
  ['Horas mes', 'Tiempo mensual de la actividad: repeticiones mensuales × minutos por repetición / 60.'],
  ['Funcionarios requeridos', 'Horas mes / 167. Permite estimar cuántas personas se requieren para cubrir la demanda mensual.'],
  ['CP', 'Carga ponderada: horas mes ajustadas por prioridad, dificultad, urgencia y bienestar.'],
  ['ICU ponderado', 'Carga ponderada frente a la capacidad disponible. Ayuda a detectar sobrecarga cualitativa.'],
  ['ICU horas', 'Horas mes frente a la capacidad mensual. Ayuda a explicar ocupación en términos de tiempo.'],
  ['Riesgo', 'Clasificación bajo, medio, alto o crítico según vencimiento, prioridad, carga y bienestar.'],
  ['Brecha', 'Funcionarios requeridos menos personas visibles en el área. Si es positiva, sugiere déficit de capacidad.'],
];

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
  renderMetricGlossary();
  updateQuickCalculator();
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
  $$('[data-section-jump]').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.sectionJump)));
  $('#taskForm').addEventListener('submit', createTask);
  ['taskSearch', 'statusFilter', 'teamFilter', 'assigneeFilter', 'priorityFilter', 'riskFilter', 'monthFilter']
    .forEach((id) => $(`#${id}`).addEventListener(id === 'taskSearch' ? 'input' : 'change', renderTasks));
  ['frequencyPerMonth', 'minutesPerOccurrence'].forEach((name) => {
    const input = $(`#taskForm [name="${name}"]`);
    input.addEventListener('input', updateEstimatePreview);
  });
  $('#calcFrequency').addEventListener('input', updateQuickCalculator);
  $('#calcMinutes').addEventListener('input', updateQuickCalculator);
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
  const users = state.dashboard.users || [];
  $('#teamSelect').innerHTML = teams.map((team) => `<option value="${team.teamId || team.id}">${escapeHtml(team.name)}</option>`).join('');
  $('#teamFilter').innerHTML = `<option value="">Todas las áreas</option>` + teams.map((team) => `<option value="${team.teamId || team.id}">${escapeHtml(team.name)}</option>`).join('');
  const userOptions = users.map((user) => `<option value="${user.userId}">${escapeHtml(user.name)} · ${user.rawUtilizationPercent}%</option>`).join('');
  $('#assigneeSelect').innerHTML = `<option value="">Sugerir automáticamente</option>` + userOptions;
  $('#assigneeFilter').innerHTML = `<option value="">Todos los responsables</option>` + userOptions;
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  $('#taskForm input[name="dueDate"]').value ||= nextWeek;
  updateEstimatePreview();
}

function renderAll() {
  renderCards();
  renderWorkload();
  renderCriticalTasks();
  renderStudy();
  renderTasks();
  renderRecommendations();
  renderReportPreview();
  renderProfile();
  if (roleCanSeeAudit()) renderAudit();
}

function setSection(section) {
  state.section = section;
  $$('.nav').forEach((button) => button.classList.toggle('active', button.dataset.section === section));
  $$('.section').forEach((el) => el.classList.toggle('active-section', el.id === section));
  $('#pageTitle').textContent = {
    dashboard: 'Inicio',
    study: 'Estudio 167',
    tasks: 'Actividades',
    recommendations: 'Alertas',
    reports: 'Reportes',
    guide: 'Guía y métricas',
    profile: 'Mi perfil',
    audit: 'Auditoría',
  }[section] || 'ASAP';
  if (section === 'audit' && roleCanSeeAudit()) renderAudit();
}

function renderCards() {
  const s = state.dashboard.summary;
  const study = state.dashboard.study;
  $('#dashboardLead').textContent = `El corte actual registra ${s.totalMonthlyHours} horas mes visibles, equivalentes a ${study.requiredStaff167} funcionarios con base en ${study.standardMonthlyHours} horas/mes.`;
  const cards = [
    ['Horas mes', s.totalMonthlyHours, 'Suma de esfuerzo mensual'],
    ['Funcionarios requeridos', s.requiredStaff167, 'Horas mes / 167'],
    ['ICU ponderado', `${s.averageUtilizationPercent}%`, 'Carga ajustada por pesos'],
    ['Tareas vencidas', s.overdueTasks, 'Riesgo operativo'],
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
        <div><strong>${escapeHtml(user.name)}</strong><span class="muted">${escapeHtml(labels[user.role] || user.role)} · ${user.openTasks} actividades abiertas</span></div>
        <span class="badge ${user.risk}">${escapeHtml(labels[user.risk] || user.risk)}</span>
      </div>
      <div class="bar"><span style="width:${width}%"></span></div>
      <div class="meta"><span>ICU ${user.utilizationPercent}%</span><span>Horas mes ${user.monthlyHours}</span><span>FTE ${user.staffNeed167}</span><span>Capacidad ${user.capacityHoursPerMonth}h</span><span>Vencidas ${user.overdueTasks}</span></div>
    </div>`;
  }).join('') : empty();

  const teams = state.dashboard.teams || [];
  $('#teamWorkload').innerHTML = teams.length ? teams.map((team) => `<div class="team-row">
    <div class="workload-head"><strong>${escapeHtml(team.name)}</strong><span class="badge ${team.rawUtilizationPercent >= 85 ? 'high' : 'low'}">${team.rawUtilizationPercent}%</span></div>
    <div class="bar"><span style="width:${Math.min(team.rawUtilizationPercent, 130)}%"></span></div>
    <div class="meta"><span>${team.members} miembros</span><span>${team.monthlyHours} horas mes</span><span>FTE ${team.staffNeed167}</span><span>Brecha ${team.staffGap167}</span><span>${team.openTasks} abiertas</span></div>
  </div>`).join('') : empty();
}

function renderCriticalTasks() {
  const tasks = [...(state.dashboard.tasks || [])]
    .filter((task) => !['done', 'cancelled'].includes(task.status))
    .sort((a, b) => b.monthlyHours - a.monthlyHours)
    .slice(0, 5);
  $('#criticalTasks').innerHTML = tasks.length ? tasks.map((task) => `
    <article class="mini-item">
      <div><strong>${escapeHtml(task.title)}</strong><span class="muted">${escapeHtml(task.teamName)} · ${escapeHtml(task.assigneeName)}</span></div>
      <div class="meta"><span>${task.monthlyHours} horas mes</span><span>FTE ${task.staffNeed167}</span><span>CP ${task.workloadScore}</span><span class="badge ${task.risk}">${escapeHtml(labels[task.risk] || task.risk)}</span></div>
    </article>`).join('') : empty();
}

function renderStudy() {
  const study = state.dashboard.study;
  const s = state.dashboard.summary;
  $('#studySummary').innerHTML = `
    <div><strong>${study.totalMonthlyHours}</strong><span>Horas mes registradas</span></div>
    <div><strong>${study.requiredStaff167}</strong><span>Funcionarios requeridos</span></div>
    <div><strong>${study.staffGap167}</strong><span>Brecha frente a usuarios visibles</span></div>
    <div><strong>${s.rawUtilizationPercent}%</strong><span>ICU por horas</span></div>`;
  const teams = state.dashboard.teams || [];
  $('#areaStudy').innerHTML = teams.length ? teams.map((team) => `
    <div class="area-row">
      <div><strong>${escapeHtml(team.name)}</strong><span class="muted">${team.openTasks} actividades abiertas · ${team.overdueTasks} vencidas</span></div>
      <div class="area-stats">
        <span><b>${team.monthlyHours}</b> horas mes</span>
        <span><b>${team.staffNeed167}</b> funcionarios</span>
        <span><b>${team.staffGap167}</b> brecha</span>
        <span><b>${team.rawUtilizationPercent}%</b> ICU horas</span>
      </div>
    </div>`).join('') : empty();
}

function renderTasks() {
  let tasks = state.dashboard.tasks || [];
  const search = $('#taskSearch').value.trim().toLowerCase();
  const filters = {
    status: $('#statusFilter').value,
    teamId: $('#teamFilter').value,
    assigneeId: $('#assigneeFilter').value,
    priority: $('#priorityFilter').value,
    risk: $('#riskFilter').value,
    month: $('#monthFilter').value,
  };
  tasks = tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.teamId && task.teamId !== filters.teamId) return false;
    if (filters.assigneeId && task.assigneeId !== filters.assigneeId) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.risk && task.risk !== filters.risk) return false;
    if (filters.month && !String(task.dueDate || '').startsWith(filters.month)) return false;
    if (search) {
      const haystack = `${task.title} ${task.description} ${task.assigneeName} ${task.teamName} ${(task.tags || []).join(' ')}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  $('#taskCount').textContent = `${tasks.length} actividades`;
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
      <span>Periodicidad: ${escapeHtml(task.periodicityLabel || 'No definida')}</span>
      <span>Frecuencia: ${escapeHtml(task.frequencyPerMonth || '—')}/mes</span>
      <span>Minutos: ${escapeHtml(task.minutesPerOccurrence || '—')}</span>
      <span>Horas mes: ${task.monthlyHours}</span>
      <span>FTE: ${task.staffNeed167}</span>
      <span>Prioridad: ${escapeHtml(labels[task.priority] || task.priority)}</span>
      <span>Dificultad: ${escapeHtml(labels[task.difficulty] || task.difficulty)}</span>
      <span>Vence: ${escapeHtml(task.dueDate || 'Sin fecha')}</span>
      <span>CP: ${task.workloadScore}</span>
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

function updateEstimatePreview() {
  const form = $('#taskForm');
  if (!form) return;
  const frequency = Number(form.frequencyPerMonth?.value || 0);
  const minutes = Number(form.minutesPerOccurrence?.value || 0);
  const hours = Math.round((frequency * minutes / 60) * 100) / 100;
  if (hours > 0) form.estimatedHours.value = hours;
  const fte = Math.round((hours / 167) * 1000) / 1000;
  $('#estimatePreview').innerHTML = `<strong>${hours || 0} horas mes</strong><span>${fte || 0} funcionarios requeridos con base 167.</span>`;
}

function updateQuickCalculator() {
  const frequency = Number($('#calcFrequency')?.value || 0);
  const minutes = Number($('#calcMinutes')?.value || 0);
  const hours = Math.round((frequency * minutes / 60) * 100) / 100;
  const fte = Math.round((hours / 167) * 100) / 100;
  $('#quickCalcResult').innerHTML = `<strong>${hours} horas mes</strong><span>${fte} funcionarios requeridos</span><small>Ejemplo: ${frequency} repeticiones × ${minutes} minutos / 60 / 167.</small>`;
}

async function createTask(event) {
  event.preventDefault();
  $('#taskFormMsg').textContent = 'Registrando actividad...';
  updateEstimatePreview();
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    if (!payload.assigneeId) delete payload.assigneeId;
    payload.monthlyHours = payload.estimatedHours;
    const result = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    const assignee = state.dashboard.users.find((user) => user.userId === result.task.assigneeId)?.name || result.task.assigneeId;
    $('#taskFormMsg').textContent = `Actividad registrada y asignada a ${assignee}.`;
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
      ? `<button class="primary" data-rec="${rec.id}">Aplicar redistribución</button>`
      : '';
    return `<article class="recommendation-card ${rec.severity || 'preventive'}">
      <div class="recommendation-head">
        <div><strong>${escapeHtml(rec.taskTitle || rec.type)}</strong><span class="muted">${escapeHtml(rec.type)}</span></div>
        <span class="badge ${rec.severity || 'medium'}">${escapeHtml(labels[rec.severity] || rec.severity || 'Medio')}</span>
      </div>
      ${rec.toUserName ? `<p>Redistribuir de <strong>${escapeHtml(rec.fromUserName)}</strong> a <strong>${escapeHtml(rec.toUserName)}</strong>. Confianza: ${Math.round((rec.confidence || 0) * 100)}%.</p>` : ''}
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

function renderReportPreview() {
  const study = state.dashboard.study;
  const teams = state.dashboard.teams || [];
  $('#reportPreview').innerHTML = `
    <div class="preview-kpis">
      <div><strong>${study.totalMonthlyHours}</strong><span>Horas mes</span></div>
      <div><strong>${study.requiredStaff167}</strong><span>Funcionarios</span></div>
      <div><strong>${state.dashboard.summary.overloadedUsers}</strong><span>Usuarios en riesgo</span></div>
    </div>
    <p class="muted">Método: ${escapeHtml(study.methodology)}</p>
    <div class="preview-table">
      ${teams.map((team) => `<div><span>${escapeHtml(team.name)}</span><b>${team.monthlyHours} h · FTE ${team.staffNeed167}</b></div>`).join('')}
    </div>`;
}

function renderMetricGlossary() {
  const target = $('#metricGlossary');
  if (!target) return;
  target.innerHTML = metricDefinitions.map(([name, desc]) => `<div class="glossary-item"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(desc)}</span></div>`).join('');
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
