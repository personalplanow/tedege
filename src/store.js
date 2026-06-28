'use strict';

const fs = require('fs');
const path = require('path');
const { hashPassword, randomId } = require('./security');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DATA_FILE = process.env.ASAP_DATA_FILE
  ? path.resolve(process.env.ASAP_DATA_FILE)
  : path.join(ROOT, 'data', 'db.json');
const SEED_FILE = path.join(ROOT, 'data', 'seed.json');

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSeed() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  return normalizeState(seed, true);
}

function normalizeState(input, fromSeed = false) {
  const state = {
    meta: {
      brand: 'ASAP design by Jeisson Steven Herrera Baquero',
      version: '1.0.0-demo',
      createdAt: input.meta?.createdAt || nowIso(),
      updatedAt: nowIso(),
    },
    organizations: input.organizations || [],
    teams: input.teams || [],
    users: input.users || [],
    tasks: input.tasks || [],
    comments: input.comments || [],
    audit: input.audit || [],
    preferences: input.preferences || {},
  };

  state.users = state.users.map((user) => {
    if (fromSeed && user.seedPassword) {
      const { hash, salt, iterations } = hashPassword(user.seedPassword);
      return {
        ...user,
        passwordHash: hash,
        passwordSalt: salt,
        passwordIterations: iterations,
        active: user.active !== false,
        createdAt: user.createdAt || nowIso(),
      };
    }
    return { ...user, active: user.active !== false };
  });

  state.tasks = state.tasks.map((task) => {
    const resolvedDueDate = task.dueDate || (typeof task.dueInDays === 'number'
      ? new Date(Date.now() + task.dueInDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : undefined);
    const { dueInDays, ...cleanTask } = task;
    return {
      ...cleanTask,
      dueDate: resolvedDueDate,
      commentsCount: state.comments.filter((comment) => comment.taskId === task.id).length,
      createdAt: task.createdAt || nowIso(),
      updatedAt: task.updatedAt || task.createdAt || nowIso(),
    };
  });

  return state;
}

class JsonStore {
  constructor(dataFile = DEFAULT_DATA_FILE) {
    this.dataFile = dataFile;
    this.state = null;
  }

  init({ reset = false } = {}) {
    ensureDir(this.dataFile);
    if (reset || !fs.existsSync(this.dataFile)) {
      this.state = loadSeed();
      this.save('seed');
      return this.state;
    }
    const parsed = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
    this.state = normalizeState(parsed, false);
    return this.state;
  }

  save(reason = 'update') {
    if (!this.state) throw new Error('Store no inicializado.');
    this.state.meta.updatedAt = nowIso();
    const tmp = `${this.dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.dataFile);
    return reason;
  }

  getState() {
    if (!this.state) this.init();
    return this.state;
  }

  reset() {
    this.state = loadSeed();
    this.save('reset');
    return this.state;
  }

  findUserByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return this.getState().users.find((user) => user.email.toLowerCase() === normalized && user.active !== false);
  }

  findUserById(id) {
    return this.getState().users.find((user) => user.id === id && user.active !== false);
  }

  findTaskById(id) {
    return this.getState().tasks.find((task) => task.id === id);
  }

  addAudit({ actorId, action, entity, entityId, before = null, after = null, note = '' }) {
    const event = {
      id: randomId('audit_'),
      actorId,
      action,
      entity,
      entityId,
      before,
      after,
      note,
      createdAt: nowIso(),
    };
    this.state.audit.unshift(event);
    this.state.audit = this.state.audit.slice(0, 300);
    return event;
  }

  createTask(payload, actorId) {
    const task = {
      id: randomId('task_'),
      title: String(payload.title).trim(),
      description: String(payload.description || '').trim(),
      organizationId: payload.organizationId || 'org_asap',
      teamId: payload.teamId || 'team_people_ops',
      assigneeId: payload.assigneeId,
      createdById: actorId,
      requiredSkill: payload.requiredSkill || 'general',
      estimatedHours: Number(payload.estimatedHours || 1),
      realHours: Number(payload.realHours || 0),
      priority: payload.priority || 'medium',
      difficulty: payload.difficulty || 'medium',
      status: payload.status || 'todo',
      dueDate: payload.dueDate,
      wellbeingSignal: payload.wellbeingSignal || 'neutral',
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.state.tasks.unshift(task);
    this.addAudit({ actorId, action: 'CREATE_TASK', entity: 'task', entityId: task.id, after: task });
    this.save('create-task');
    return task;
  }

  updateTask(id, patch, actorId) {
    const task = this.findTaskById(id);
    if (!task) {
      const error = new Error('Tarea no encontrada.');
      error.statusCode = 404;
      throw error;
    }
    const before = clone(task);
    const allowed = [
      'title', 'description', 'teamId', 'assigneeId', 'requiredSkill', 'estimatedHours', 'realHours',
      'priority', 'difficulty', 'status', 'dueDate', 'wellbeingSignal', 'tags'
    ];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        task[key] = key === 'estimatedHours' || key === 'realHours' ? Number(patch[key]) : patch[key];
      }
    }
    task.updatedAt = nowIso();
    if (task.status === 'done' && !task.completedAt) task.completedAt = nowIso();
    if (task.status !== 'done') delete task.completedAt;
    this.addAudit({ actorId, action: 'UPDATE_TASK', entity: 'task', entityId: task.id, before, after: clone(task) });
    this.save('update-task');
    return task;
  }

  addComment(taskId, text, actorId) {
    const task = this.findTaskById(taskId);
    if (!task) {
      const error = new Error('Tarea no encontrada.');
      error.statusCode = 404;
      throw error;
    }
    const comment = {
      id: randomId('comment_'),
      taskId,
      actorId,
      text: String(text || '').trim(),
      createdAt: nowIso(),
    };
    this.state.comments.unshift(comment);
    this.addAudit({ actorId, action: 'ADD_COMMENT', entity: 'task', entityId: taskId, after: comment });
    this.save('add-comment');
    return comment;
  }

  updateUserPreferences(userId, patch) {
    const user = this.findUserById(userId);
    if (!user) {
      const error = new Error('Usuario no encontrado.');
      error.statusCode = 404;
      throw error;
    }
    user.preferences = {
      ...(user.preferences || {}),
      notifications: Boolean(patch.notifications),
      googleCalendarConnected: Boolean(patch.googleCalendarConnected),
      theme: patch.theme || user.preferences?.theme || 'light',
    };
    user.updatedAt = nowIso();
    this.addAudit({ actorId: userId, action: 'UPDATE_PROFILE', entity: 'user', entityId: userId, after: user.preferences });
    this.save('update-preferences');
    return user.preferences;
  }
}

module.exports = {
  JsonStore,
  DEFAULT_DATA_FILE,
  nowIso,
  clone,
};
