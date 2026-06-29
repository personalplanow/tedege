'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { taskMonthlyHours, taskStaffNeed, taskWorkloadScore, computeAnalytics } = require('../src/analytics');
const { JsonStore } = require('../src/store');


test('calcula horas mes y funcionarios requeridos con regla 167', () => {
  const task = { frequencyPerMonth: 280, minutesPerOccurrence: 20 };
  assert.equal(taskMonthlyHours(task), 93.33);
  assert.equal(taskStaffNeed(task, 167), 0.559);
});

test('calcula carga ponderada CP con prioridad, dificultad y urgencia', () => {
  const score = taskWorkloadScore({
    estimatedHours: 10,
    priority: 'critical',
    difficulty: 'high',
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    status: 'todo',
    wellbeingSignal: 'neutral',
  });
  assert.equal(score, 48);
});

test('detecta usuarios en riesgo y genera recomendaciones de redistribucion', () => {
  const store = new JsonStore('/tmp/asap-test-db.json');
  const state = store.init({ reset: true });
  const currentUser = state.users.find((user) => user.id === 'user_admin');
  const analytics = computeAnalytics(state, currentUser);
  assert.ok(analytics.summary.activeTasks >= 1);
  assert.ok(analytics.users.some((user) => user.risk === 'high' || user.risk === 'critical'));
  assert.ok(analytics.recommendations.length >= 1);
});
