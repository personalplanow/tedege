'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { JsonStore } = require('./src/store');
const { computeAnalytics, toCsvReport, taskMonthlyHours } = require('./src/analytics');
const { randomId, verifyPassword, sanitizeUser, requireFields } = require('./src/security');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEMO_RESET_ENABLED = process.env.ASAP_DEMO_RESET !== 'false';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const store = new JsonStore();
store.init();
const sessions = new Map();

function json(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...securityHeaders(),
    ...headers,
  });
  res.end(body);
}

function text(res, statusCode, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    ...securityHeaders(),
    ...headers,
  });
  res.end(body);
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 1_000_000) {
        const error = new Error('Payload demasiado grande.');
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        error.statusCode = 400;
        error.message = 'JSON invalido.';
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

function getCurrentUser(req) {
  const token = getToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return store.findUserById(session.userId);
}

function requireAuth(req) {
  const user = getCurrentUser(req);
  if (!user) {
    const error = new Error('Sesion no valida o expirada.');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

function requireAnyRole(user, roles) {
  if (!roles.includes(user.role)) {
    const error = new Error('No tienes permisos para ejecutar esta accion.');
    error.statusCode = 403;
    throw error;
  }
}

function normalizeTaskPayload(body) {
  const payload = { ...body };
  ['estimatedHours', 'realHours', 'frequencyPerMonth', 'minutesPerOccurrence', 'monthlyHours'].forEach((field) => {
    if (payload[field] !== undefined && payload[field] !== '') payload[field] = Number(payload[field]);
  });
  if (payload.frequencyPerMonth !== undefined && (!Number.isFinite(payload.frequencyPerMonth) || payload.frequencyPerMonth < 0 || payload.frequencyPerMonth > 100000)) {
    const error = new Error('Las repeticiones mensuales deben estar entre 0 y 100000.');
    error.statusCode = 400;
    throw error;
  }
  if (payload.minutesPerOccurrence !== undefined && (!Number.isFinite(payload.minutesPerOccurrence) || payload.minutesPerOccurrence < 0 || payload.minutesPerOccurrence > 1440)) {
    const error = new Error('Los minutos por repeticion deben estar entre 0 y 1440.');
    error.statusCode = 400;
    throw error;
  }
  if (payload.estimatedHours === undefined || payload.estimatedHours === '') {
    const calculated = taskMonthlyHours(payload);
    if (calculated > 0) payload.estimatedHours = calculated;
  }
  if (payload.estimatedHours !== undefined) {
    payload.estimatedHours = Number(payload.estimatedHours);
    if (!Number.isFinite(payload.estimatedHours) || payload.estimatedHours <= 0 || payload.estimatedHours > 100000) {
      const error = new Error('El tiempo estimado debe ser un numero mayor a 0 y menor o igual a 100000.');
      error.statusCode = 400;
      throw error;
    }
  }
  if (payload.monthlyHours === undefined || payload.monthlyHours === '') {
    const calculated = taskMonthlyHours(payload);
    if (calculated > 0) payload.monthlyHours = calculated;
  }
  if (payload.realHours !== undefined) payload.realHours = Number(payload.realHours) || 0;
  if (payload.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) {
    const error = new Error('La fecha de vencimiento debe tener formato YYYY-MM-DD.');
    error.statusCode = 400;
    throw error;
  }
  if (payload.tags && typeof payload.tags === 'string') {
    payload.tags = payload.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return payload;
}

function suggestedAssignee(payload, currentUser) {
  const state = store.getState();
  const analytics = computeAnalytics(state, currentUser);
  const skill = payload.requiredSkill || 'general';
  const teamId = payload.teamId || 'team_people_ops';
  const candidates = analytics.users
    .map((score) => ({ ...score, raw: state.users.find((user) => user.id === score.userId) }))
    .filter((candidate) => candidate.raw?.teamIds?.includes(teamId))
    .filter((candidate) => candidate.raw?.skills?.includes(skill) || candidate.raw?.skills?.includes('general'))
    .sort((a, b) => a.utilization - b.utilization);
  return candidates[0]?.userId || currentUser.id;
}

function filterTasksForQuery(tasks, query) {
  return tasks.filter((task) => {
    if (query.get('status') && task.status !== query.get('status')) return false;
    if (query.get('assigneeId') && task.assigneeId !== query.get('assigneeId')) return false;
    if (query.get('teamId') && task.teamId !== query.get('teamId')) return false;
    if (query.get('month') && !String(task.dueDate || '').startsWith(query.get('month'))) return false;
    if (query.get('search')) {
      const needle = query.get('search').toLowerCase();
      const haystack = `${task.title} ${task.description} ${task.assigneeName} ${task.teamName}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function htmlReport(analytics) {
  const userRows = analytics.users.map((user) => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td>${user.capacityHoursPerMonth}</td>
      <td>${user.monthlyHours}</td>
      <td>${user.staffNeed167}</td>
      <td>${user.workloadScore}</td>
      <td>${user.rawUtilizationPercent}%</td>
      <td>${escapeHtml(user.risk)}</td>
    </tr>`).join('');
  const teamRows = analytics.teams.map((team) => `
    <tr>
      <td>${escapeHtml(team.name)}</td>
      <td>${team.members}</td>
      <td>${team.monthlyHours}</td>
      <td>${team.staffNeed167}</td>
      <td>${team.staffGap167}</td>
      <td>${team.rawUtilizationPercent}%</td>
      <td>${team.openTasks}</td>
    </tr>`).join('');
  const taskRows = analytics.tasks
    .filter((task) => !['done', 'cancelled'].includes(task.status))
    .sort((a, b) => b.monthlyHours - a.monthlyHours)
    .slice(0, 18)
    .map((task) => `
    <tr>
      <td>${escapeHtml(task.title)}</td>
      <td>${escapeHtml(task.teamName)}</td>
      <td>${escapeHtml(task.assigneeName)}</td>
      <td>${escapeHtml(task.periodicityLabel)}</td>
      <td>${task.frequencyPerMonth || ''}</td>
      <td>${task.minutesPerOccurrence || ''}</td>
      <td>${task.monthlyHours}</td>
      <td>${task.staffNeed167}</td>
      <td>${escapeHtml(task.risk)}</td>
    </tr>`).join('');
  const metricRows = [
    ['Horas mes', 'Repeticiones mensuales x minutos por repeticion / 60. Es la base operativa del estudio de cargas.'],
    ['Funcionarios requeridos', 'Horas mes divididas entre 167. Permite estimar necesidad de personal por area o proceso.'],
    ['CP', 'Carga ponderada: horas mes ajustadas por prioridad, dificultad, urgencia y bienestar.'],
    ['ICU', 'Indice de capacidad utilizada: carga frente a capacidad disponible del usuario o equipo.'],
    ['Riesgo', 'Clasificacion bajo, medio, alto o critico segun vencimiento, prioridad, utilizacion y bienestar.'],
  ].map(([name, description]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(description)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Reporte ASAP - Cargas laborales</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#1f2937}h1{margin-bottom:0}h2{margin-top:28px}.muted{color:#6b7280}.lead{max-width:980px;line-height:1.55}.cards{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;margin:20px 0}.card{border:1px solid #d1d5db;border-radius:12px;padding:14px;background:#f8fafc}.card strong{display:block;font-size:1.8rem}table{border-collapse:collapse;width:100%;margin-top:12px;font-size:.92rem}th,td{border:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top}th{background:#eef2ff}.print{margin:16px 0;padding:10px 14px;border:0;border-radius:10px;background:#2054f4;color:white;font-weight:700}.notice{border-left:4px solid #2054f4;background:#eef2ff;padding:12px;border-radius:10px}.page-break{page-break-before:always}@media print{.print{display:none}body{margin:18mm}.cards{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<h1>ASAP design by Jeisson Steven Herrera Baquero</h1>
<p class="muted">Informe ejecutivo de estudio de cargas laborales generado el ${escapeHtml(analytics.generatedAt)}.</p>
<button class="print" onclick="window.print()">Imprimir / guardar PDF</button>
<p class="lead">Este reporte consolida actividades registradas en el aplicativo y calcula la necesidad de personal con la regla <strong>horas mes / ${analytics.study.standardMonthlyHours}</strong>. La vista sirve como plantilla precargada para sustentar la demo: permite explicar carga por area, personal requerido, brecha estimada, indicadores y recomendaciones.</p>
<div class="cards">
  <div class="card"><span>Horas mes</span><strong>${analytics.study.totalMonthlyHours}</strong></div>
  <div class="card"><span>Funcionarios requeridos</span><strong>${analytics.study.requiredStaff167}</strong></div>
  <div class="card"><span>Brecha estimada</span><strong>${analytics.study.staffGap167}</strong></div>
  <div class="card"><span>Alertas / recomendaciones</span><strong>${analytics.summary.recommendations}</strong></div>
</div>
<div class="notice"><strong>Metodo:</strong> ${escapeHtml(analytics.study.methodology)}</div>
<h2>Resumen por area o equipo</h2>
<table><thead><tr><th>Area</th><th>Miembros</th><th>Horas mes</th><th>Funcionarios requeridos</th><th>Brecha</th><th>ICU horas</th><th>Tareas abiertas</th></tr></thead><tbody>${teamRows}</tbody></table>
<h2>Resumen por colaborador</h2>
<table><thead><tr><th>Usuario</th><th>Rol</th><th>Capacidad mensual</th><th>Horas mes</th><th>Funcionarios requeridos</th><th>CP</th><th>ICU horas</th><th>Riesgo</th></tr></thead><tbody>${userRows}</tbody></table>
<h2 class="page-break">Actividades de mayor impacto</h2>
<table><thead><tr><th>Actividad</th><th>Area</th><th>Responsable</th><th>Periodicidad</th><th>Repeticiones mes</th><th>Minutos</th><th>Horas mes</th><th>Funcionarios</th><th>Riesgo</th></tr></thead><tbody>${taskRows}</tbody></table>
<h2>Diccionario de metricas</h2>
<table><thead><tr><th>Metrica</th><th>Descripcion</th></tr></thead><tbody>${metricRows}</tbody></table>
<p class="muted">Las recomendaciones son apoyo a la decision: deben ser revisadas por un lider autorizado antes de cambiar responsabilidades.</p>
</body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function handleApi(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;
  const parts = pathname.split('/').filter(Boolean);

  if (method === 'GET' && pathname === '/health') {
    return json(res, 200, { ok: true, brand: store.getState().meta.brand, uptimeSeconds: Math.round(process.uptime()) });
  }

  if (method === 'POST' && pathname === '/api/login') {
    const body = await parseBody(req);
    requireFields(body, ['email', 'password']);
    const user = store.findUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user)) {
      return json(res, 401, { error: 'Credenciales invalidas.' });
    }
    const token = randomId('token_');
    sessions.set(token, { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
    store.addAudit({ actorId: user.id, action: 'LOGIN', entity: 'session', entityId: token, note: 'Inicio de sesion demo' });
    store.save('login');
    return json(res, 200, { token, user: sanitizeUser(user), expiresInHours: 8 });
  }

  if (method === 'POST' && pathname === '/api/logout') {
    const token = getToken(req);
    if (token) sessions.delete(token);
    return json(res, 200, { ok: true });
  }

  const currentUser = requireAuth(req);
  const state = store.getState();

  if (method === 'GET' && pathname === '/api/me') {
    return json(res, 200, { user: sanitizeUser(currentUser), brand: state.meta.brand });
  }

  if (method === 'GET' && pathname === '/api/bootstrap') {
    const analytics = computeAnalytics(state, currentUser);
    return json(res, 200, {
      brand: state.meta.brand,
      organization: state.organizations[0],
      teams: state.teams,
      users: analytics.users,
      currentUser: sanitizeUser(currentUser),
      summary: analytics.summary,
    });
  }

  if (method === 'GET' && pathname === '/api/dashboard') {
    return json(res, 200, computeAnalytics(state, currentUser));
  }

  if (method === 'GET' && pathname === '/api/tasks') {
    const analytics = computeAnalytics(state, currentUser);
    const tasks = filterTasksForQuery(analytics.tasks, url.searchParams);
    return json(res, 200, { tasks, total: tasks.length });
  }

  if (method === 'POST' && pathname === '/api/tasks') {
    requireAnyRole(currentUser, ['admin', 'hr', 'leader', 'consultant']);
    const body = normalizeTaskPayload(await parseBody(req));
    requireFields(body, ['title', 'priority', 'difficulty', 'dueDate']);
    if (!body.assigneeId) body.assigneeId = suggestedAssignee(body, currentUser);
    const task = store.createTask(body, currentUser.id);
    return json(res, 201, { task });
  }

  if (parts[0] === 'api' && parts[1] === 'tasks' && parts[2]) {
    const taskId = parts[2];
    const task = store.findTaskById(taskId);
    if (!task) return json(res, 404, { error: 'Tarea no encontrada.' });

    if (method === 'PATCH' && parts.length === 3) {
      if (currentUser.role === 'employee' && task.assigneeId !== currentUser.id) {
        return json(res, 403, { error: 'Solo puedes actualizar tus propias tareas.' });
      }
      const patch = normalizeTaskPayload(await parseBody(req));
      if (currentUser.role === 'employee') {
        const allowedEmployee = ['status', 'realHours', 'wellbeingSignal'];
        Object.keys(patch).forEach((key) => { if (!allowedEmployee.includes(key)) delete patch[key]; });
      }
      const updated = store.updateTask(taskId, patch, currentUser.id);
      return json(res, 200, { task: updated });
    }

    if (method === 'POST' && parts[3] === 'comments') {
      const body = await parseBody(req);
      requireFields(body, ['text']);
      const comment = store.addComment(taskId, body.text, currentUser.id);
      return json(res, 201, { comment });
    }

    if (method === 'GET' && parts[3] === 'comments') {
      const comments = state.comments
        .filter((comment) => comment.taskId === taskId)
        .map((comment) => ({
          ...comment,
          actorName: state.users.find((user) => user.id === comment.actorId)?.name || 'Usuario',
        }));
      return json(res, 200, { comments });
    }
  }

  if (method === 'POST' && pathname === '/api/suggest-assignee') {
    requireAnyRole(currentUser, ['admin', 'hr', 'leader', 'consultant']);
    const payload = normalizeTaskPayload(await parseBody(req));
    const userId = suggestedAssignee(payload, currentUser);
    const user = state.users.find((item) => item.id === userId);
    return json(res, 200, { suggestedUser: sanitizeUser(user) });
  }

  if (method === 'GET' && pathname === '/api/recommendations') {
    const analytics = computeAnalytics(state, currentUser);
    return json(res, 200, { recommendations: analytics.recommendations });
  }

  if (method === 'POST' && parts[0] === 'api' && parts[1] === 'recommendations' && parts[2] && parts[3] === 'apply') {
    requireAnyRole(currentUser, ['admin', 'hr', 'leader', 'consultant']);
    const recommendationId = parts[2];
    const analytics = computeAnalytics(state, currentUser);
    const recommendation = analytics.recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) return json(res, 404, { error: 'Recomendacion no encontrada o ya no aplica.' });
    if (recommendation.type !== 'REASSIGN_TASK') return json(res, 400, { error: 'Esta alerta no se aplica como reasignacion.' });
    const updated = store.updateTask(recommendation.taskId, { assigneeId: recommendation.toUserId }, currentUser.id);
    store.addAudit({ actorId: currentUser.id, action: 'APPLY_RECOMMENDATION', entity: 'task', entityId: updated.id, after: recommendation });
    store.save('apply-recommendation');
    return json(res, 200, { task: updated, applied: recommendation });
  }

  if (method === 'GET' && pathname === '/api/reports/workload.csv') {
    const analytics = computeAnalytics(state, currentUser);
    return text(res, 200, toCsvReport(analytics), 'text/csv; charset=utf-8', {
      'Content-Disposition': 'attachment; filename="asap-cargas-laborales.csv"',
    });
  }

  if (method === 'GET' && pathname === '/api/reports/workload.html') {
    const analytics = computeAnalytics(state, currentUser);
    return text(res, 200, htmlReport(analytics), 'text/html; charset=utf-8');
  }

  if (method === 'GET' && pathname === '/api/audit') {
    requireAnyRole(currentUser, ['admin', 'hr', 'consultant']);
    const audit = state.audit.slice(0, 80).map((event) => ({
      ...event,
      actorName: state.users.find((user) => user.id === event.actorId)?.name || 'Sistema',
    }));
    return json(res, 200, { audit });
  }

  if (method === 'PATCH' && pathname === '/api/profile/preferences') {
    const preferences = store.updateUserPreferences(currentUser.id, await parseBody(req));
    return json(res, 200, { preferences });
  }

  if (method === 'POST' && pathname === '/api/reset-demo') {
    requireAnyRole(currentUser, ['admin']);
    if (!DEMO_RESET_ENABLED) return json(res, 403, { error: 'Reset demo deshabilitado en este ambiente.' });
    store.reset();
    sessions.clear();
    return json(res, 200, { ok: true, message: 'Demo restaurada. Inicia sesion nuevamente.' });
  }

  return json(res, 404, { error: 'Endpoint no encontrado.' });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return text(res, 403, 'Acceso denegado.');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return text(res, 404, 'Archivo no encontrado.');
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    ...securityHeaders(),
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET') return text(res, 405, 'Metodo no permitido.');
    return serveStatic(req, res, url);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500 ? 'Error interno del servidor.' : error.message;
    if (statusCode >= 500) console.error(error);
    return json(res, statusCode, { error: message });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`ASAP design by Jeisson Steven Herrera Baquero escuchando en http://${HOST}:${PORT}`);
  });
}

module.exports = { server, store, sessions };
