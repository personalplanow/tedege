'use strict';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STANDARD_MONTHLY_HOURS = 167;

const PRIORITY_WEIGHT = {
  low: 1,
  medium: 1.25,
  high: 1.6,
  critical: 2,
};

const DIFFICULTY_WEIGHT = {
  low: 1,
  medium: 1.3,
  high: 1.6,
};

const WELLBEING_WEIGHT = {
  positive: 0.95,
  neutral: 1,
  fatigue: 1.15,
  stress: 1.25,
};

const PERIODICITY_LABEL = {
  daily: 'Diaria',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  eventual: 'Eventual',
};

function round(value, digits = 2) {
  const base = 10 ** digits;
  return Math.round((Number(value) || 0) * base) / base;
}

function daysUntil(dueDate, now = new Date()) {
  if (!dueDate) return 999;
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  return Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
}

function urgencyWeight(task, now = new Date()) {
  if (task.status === 'done') return 0;
  const days = daysUntil(task.dueDate, now);
  if (days < 0) return 1.8;
  if (days <= 2) return 1.5;
  if (days <= 7) return 1.2;
  return 1;
}

function getStandardMonthlyHours(state) {
  const configured = Number(state?.organizations?.[0]?.policy?.standardMonthlyHours);
  return Number.isFinite(configured) && configured > 0 ? configured : STANDARD_MONTHLY_HOURS;
}

function taskMonthlyHours(task) {
  const explicit = Number(task.monthlyHours);
  if (Number.isFinite(explicit) && explicit > 0) return round(explicit, 2);
  const frequency = Number(task.frequencyPerMonth);
  const minutes = Number(task.minutesPerOccurrence);
  if (Number.isFinite(frequency) && frequency > 0 && Number.isFinite(minutes) && minutes > 0) {
    return round((frequency * minutes) / 60, 2);
  }
  return round(Math.max(Number(task.estimatedHours || 0), 0), 2);
}

function taskStaffNeed(task, standardMonthlyHours = STANDARD_MONTHLY_HOURS) {
  return round(taskMonthlyHours(task) / Math.max(Number(standardMonthlyHours) || STANDARD_MONTHLY_HOURS, 1), 3);
}

function taskWorkloadScore(task, now = new Date()) {
  if (task.status === 'done' || task.status === 'cancelled') return 0;
  const estimated = taskMonthlyHours(task);
  const score = estimated
    * (PRIORITY_WEIGHT[task.priority] || PRIORITY_WEIGHT.medium)
    * (DIFFICULTY_WEIGHT[task.difficulty] || DIFFICULTY_WEIGHT.medium)
    * urgencyWeight(task, now)
    * (WELLBEING_WEIGHT[task.wellbeingSignal] || WELLBEING_WEIGHT.neutral);
  return round(score, 2);
}

function userCapacityMonthly(user, standardMonthlyHours = STANDARD_MONTHLY_HOURS) {
  const capacity = Number(user.capacityHoursPerMonth);
  if (Number.isFinite(capacity) && capacity > 0) return capacity;
  return Number(standardMonthlyHours) || STANDARD_MONTHLY_HOURS;
}

function taskRisk(task, assignee, userUtilization, now = new Date()) {
  if (task.status === 'done') return 'closed';
  const days = daysUntil(task.dueDate, now);
  if (days < 0) return 'critical';
  if (task.priority === 'critical' && userUtilization >= 0.85) return 'critical';
  if (days <= 2 && userUtilization >= 0.75) return 'high';
  if (task.priority === 'high' || userUtilization >= 0.85) return 'medium';
  return 'low';
}

function userRisk(weightedUtilization, rawUtilization, user) {
  const stress = user.wellbeing?.stress || 0;
  const fatigue = user.wellbeing?.fatigue || 0;
  if (weightedUtilization >= 1 || rawUtilization >= 1 || stress >= 4.5 || fatigue >= 4.5) return 'critical';
  if (weightedUtilization >= 0.85 || rawUtilization >= 0.85 || stress >= 4 || fatigue >= 4) return 'high';
  if (weightedUtilization >= 0.6 || rawUtilization >= 0.6 || stress >= 3 || fatigue >= 3) return 'medium';
  return 'low';
}

function canViewUser(targetUser, currentUser) {
  if (!currentUser) return false;
  if (['admin', 'hr', 'director', 'consultant'].includes(currentUser.role)) return true;
  if (currentUser.role === 'leader') return currentUser.teamIds?.some((teamId) => targetUser.teamIds?.includes(teamId));
  return currentUser.id === targetUser.id;
}

function getVisibleUsers(state, currentUser) {
  return state.users.filter((user) => user.active !== false && canViewUser(user, currentUser));
}

function isTaskVisible(task, currentUser, visibleUserIds) {
  if (!currentUser) return false;
  if (['admin', 'hr', 'director', 'consultant'].includes(currentUser.role)) return true;
  if (currentUser.role === 'leader') return currentUser.teamIds?.includes(task.teamId) || visibleUserIds.has(task.assigneeId);
  return task.assigneeId === currentUser.id || task.createdById === currentUser.id;
}

function computeAnalytics(state, currentUser, options = {}) {
  const now = options.now || new Date();
  const standardMonthlyHours = getStandardMonthlyHours(state);
  const visibleUsers = getVisibleUsers(state, currentUser);
  const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
  const visibleTasks = state.tasks.filter((task) => isTaskVisible(task, currentUser, visibleUserIds));
  const activeTasks = visibleTasks.filter((task) => !['done', 'cancelled'].includes(task.status));
  const completedTasks = visibleTasks.filter((task) => task.status === 'done');

  const userScores = visibleUsers.map((user) => {
    const userTasks = state.tasks.filter((task) => task.assigneeId === user.id && !['done', 'cancelled'].includes(task.status));
    const workload = userTasks.reduce((sum, task) => sum + taskWorkloadScore(task, now), 0);
    const monthlyHours = userTasks.reduce((sum, task) => sum + taskMonthlyHours(task), 0);
    const capacityMonthly = Math.max(userCapacityMonthly(user, standardMonthlyHours), 1);
    const weightedUtilization = workload / capacityMonthly;
    const rawUtilization = monthlyHours / capacityMonthly;
    const highPriorityTasks = userTasks.filter((task) => ['high', 'critical'].includes(task.priority)).length;
    const overdueTasks = userTasks.filter((task) => daysUntil(task.dueDate, now) < 0).length;
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teamIds: user.teamIds || [],
      skills: user.skills || [],
      capacityHoursPerWeek: user.capacityHoursPerWeek || null,
      capacityHoursPerMonth: capacityMonthly,
      monthlyHours: round(monthlyHours, 2),
      staffNeed167: round(monthlyHours / standardMonthlyHours, 3),
      workloadScore: round(workload, 2),
      utilization: round(weightedUtilization, 3),
      rawUtilization: round(rawUtilization, 3),
      utilizationPercent: round(weightedUtilization * 100, 1),
      rawUtilizationPercent: round(rawUtilization * 100, 1),
      openTasks: userTasks.length,
      highPriorityTasks,
      overdueTasks,
      wellbeing: user.wellbeing || {},
      risk: userRisk(weightedUtilization, rawUtilization, user),
    };
  });

  const utilizationByUser = new Map(userScores.map((score) => [score.userId, score.utilization]));
  const tasksWithMetrics = visibleTasks.map((task) => {
    const assignee = state.users.find((user) => user.id === task.assigneeId);
    const team = state.teams.find((item) => item.id === task.teamId);
    const monthlyHours = taskMonthlyHours(task);
    const cp = taskWorkloadScore(task, now);
    const risk = taskRisk(task, assignee, utilizationByUser.get(task.assigneeId) || 0, now);
    return {
      ...task,
      assigneeName: assignee?.name || 'Sin responsable',
      teamName: team?.name || 'Sin equipo',
      monthlyHours,
      staffNeed167: round(monthlyHours / standardMonthlyHours, 3),
      workloadScore: cp,
      urgencyWeight: round(urgencyWeight(task, now), 2),
      daysUntilDue: daysUntil(task.dueDate, now),
      periodicityLabel: PERIODICITY_LABEL[task.periodicity] || task.periodicity || 'No definida',
      risk,
      commentsCount: state.comments.filter((comment) => comment.taskId === task.id).length,
    };
  });

  const totalWorkload = activeTasks.reduce((sum, task) => sum + taskWorkloadScore(task, now), 0);
  const totalMonthlyHours = activeTasks.reduce((sum, task) => sum + taskMonthlyHours(task), 0);
  const totalCapacity = visibleUsers.reduce((sum, user) => sum + userCapacityMonthly(user, standardMonthlyHours), 0);
  const requiredStaff167 = totalMonthlyHours / standardMonthlyHours;
  const overdue = activeTasks.filter((task) => daysUntil(task.dueDate, now) < 0).length;
  const dueSoon = activeTasks.filter((task) => {
    const days = daysUntil(task.dueDate, now);
    return days >= 0 && days <= 3;
  }).length;
  const completedOnTime = completedTasks.filter((task) => task.completedAt && task.dueDate && new Date(task.completedAt) <= new Date(`${task.dueDate}T23:59:59`)).length;
  const onTimeRate = completedTasks.length ? completedOnTime / completedTasks.length : 1;
  const overloadedUsers = userScores.filter((score) => score.risk === 'critical' || score.risk === 'high').length;

  const teamScores = state.teams
    .filter((team) => ['admin', 'hr', 'director', 'consultant'].includes(currentUser.role) || currentUser.teamIds?.includes(team.id))
    .map((team) => {
      const teamUsers = userScores.filter((score) => score.teamIds.includes(team.id));
      const teamTasks = tasksWithMetrics.filter((task) => task.teamId === team.id && !['done', 'cancelled'].includes(task.status));
      const workload = teamTasks.reduce((sum, task) => sum + task.workloadScore, 0);
      const monthlyHours = teamTasks.reduce((sum, task) => sum + task.monthlyHours, 0);
      const capacity = teamUsers.reduce((sum, user) => sum + user.capacityHoursPerMonth, 0) || 1;
      const requiredStaff = monthlyHours / standardMonthlyHours;
      return {
        teamId: team.id,
        name: team.name,
        members: teamUsers.length,
        openTasks: teamTasks.length,
        monthlyHours: round(monthlyHours, 2),
        staffNeed167: round(requiredStaff, 3),
        staffGap167: round(requiredStaff - teamUsers.length, 2),
        workloadScore: round(workload, 2),
        capacityHoursPerMonth: round(capacity, 2),
        utilizationPercent: round((workload / capacity) * 100, 1),
        rawUtilizationPercent: round((monthlyHours / capacity) * 100, 1),
        overdueTasks: teamTasks.filter((task) => task.daysUntilDue < 0).length,
      };
    });

  const recommendations = buildRecommendations(state, userScores, tasksWithMetrics, currentUser, now);

  return {
    brand: state.meta.brand,
    generatedAt: now.toISOString(),
    study: {
      standardMonthlyHours,
      methodology: 'Horas mes por actividad = repeticiones mensuales x minutos por repeticion / 60; necesidad de personal = horas mes / 167.',
      totalMonthlyHours: round(totalMonthlyHours, 2),
      requiredStaff167: round(requiredStaff167, 2),
      currentVisibleStaff: visibleUsers.length,
      staffGap167: round(requiredStaff167 - visibleUsers.length, 2),
    },
    summary: {
      totalVisibleUsers: visibleUsers.length,
      activeTasks: activeTasks.length,
      completedTasks: completedTasks.length,
      totalMonthlyHours: round(totalMonthlyHours, 2),
      requiredStaff167: round(requiredStaff167, 2),
      totalWorkload: round(totalWorkload, 2),
      totalCapacity: round(totalCapacity, 2),
      averageUtilizationPercent: totalCapacity ? round((totalWorkload / totalCapacity) * 100, 1) : 0,
      rawUtilizationPercent: totalCapacity ? round((totalMonthlyHours / totalCapacity) * 100, 1) : 0,
      overdueTasks: overdue,
      dueSoonTasks: dueSoon,
      overloadedUsers,
      onTimeRatePercent: round(onTimeRate * 100, 1),
      recommendations: recommendations.length,
    },
    users: userScores,
    teams: teamScores,
    tasks: tasksWithMetrics,
    recommendations,
  };
}

function buildRecommendations(state, userScores, tasksWithMetrics, currentUser, now = new Date()) {
  const usersById = new Map(state.users.map((user) => [user.id, user]));
  const visibleUserIds = new Set(userScores.map((user) => user.userId));
  const recommendations = [];
  const overloaded = userScores
    .filter((user) => user.utilization >= 0.85 || user.rawUtilization >= 0.85)
    .sort((a, b) => Math.max(b.utilization, b.rawUtilization) - Math.max(a.utilization, a.rawUtilization));

  for (const source of overloaded) {
    const sourceTasks = tasksWithMetrics
      .filter((task) => task.assigneeId === source.userId && !['done', 'cancelled'].includes(task.status))
      .sort((a, b) => b.workloadScore - a.workloadScore);

    for (const task of sourceTasks) {
      const candidates = userScores
        .filter((candidate) => candidate.userId !== source.userId)
        .filter((candidate) => candidate.utilization < 0.8 && candidate.rawUtilization < 0.8)
        .filter((candidate) => visibleUserIds.has(candidate.userId))
        .filter((candidate) => {
          const raw = usersById.get(candidate.userId);
          return raw?.skills?.includes(task.requiredSkill) || raw?.skills?.includes('general');
        })
        .sort((a, b) => Math.max(a.utilization, a.rawUtilization) - Math.max(b.utilization, b.rawUtilization));
      const target = candidates[0];
      if (!target) continue;

      const targetAfter = (target.workloadScore + task.workloadScore) / target.capacityHoursPerMonth;
      const targetRawAfter = (target.monthlyHours + task.monthlyHours) / target.capacityHoursPerMonth;
      const sourceAfter = (source.workloadScore - task.workloadScore) / source.capacityHoursPerMonth;
      if (targetAfter > 0.95 || targetRawAfter > 0.95) continue;

      recommendations.push({
        id: `rec_${task.id}_${target.userId}`,
        type: 'REASSIGN_TASK',
        taskId: task.id,
        taskTitle: task.title,
        fromUserId: source.userId,
        fromUserName: source.name,
        toUserId: target.userId,
        toUserName: target.name,
        estimatedWorkloadReduction: round(source.utilizationPercent - sourceAfter * 100, 1),
        targetProjectedUtilizationPercent: round(targetAfter * 100, 1),
        sourceProjectedUtilizationPercent: round(sourceAfter * 100, 1),
        severity: Math.max(source.utilization, source.rawUtilization) >= 1 ? 'critical' : 'preventive',
        confidence: calculateConfidence(task, source, target),
        explanation: [
          `${source.name} registra ${round(source.utilizationPercent, 1)}% de ICU ponderado y ${round(source.rawUtilizationPercent, 1)}% de horas mes.`,
          `${target.name} tiene ${round(target.rawUtilizationPercent, 1)}% de ocupacion mensual y habilidad compatible: ${task.requiredSkill}.`,
          `La actividad equivale a ${task.monthlyHours} horas mes, ${task.staffNeed167} funcionarios y ${task.workloadScore} puntos CP.`,
        ],
      });
      break;
    }
  }

  const taskAlerts = tasksWithMetrics
    .filter((task) => !['done', 'cancelled'].includes(task.status))
    .filter((task) => task.risk === 'critical' || task.risk === 'high')
    .slice(0, 8)
    .map((task) => ({
      id: `alert_${task.id}`,
      type: task.daysUntilDue < 0 ? 'OVERDUE_TASK' : 'DUE_SOON_OR_HIGH_LOAD',
      taskId: task.id,
      taskTitle: task.title,
      severity: task.risk,
      explanation: [
        task.daysUntilDue < 0 ? 'La tarea se encuentra vencida.' : `La tarea vence en ${task.daysUntilDue} dia(s).`,
        `Prioridad ${task.priority}, dificultad ${task.difficulty}, ${task.monthlyHours} horas mes, CP ${task.workloadScore}.`,
      ],
    }));

  return [...recommendations, ...taskAlerts].slice(0, 12);
}

function calculateConfidence(task, source, target) {
  let confidence = 0.65;
  if (target.rawUtilization < 0.5) confidence += 0.12;
  if (task.requiredSkill && target.skills?.includes(task.requiredSkill)) confidence += 0.12;
  if (source.utilization >= 1 || source.rawUtilization >= 1) confidence += 0.08;
  if (task.daysUntilDue <= 3) confidence += 0.03;
  return round(Math.min(confidence, 0.95), 2);
}

function toCsvReport(analytics) {
  const rows = [
    ['ASAP - Resumen ejecutivo de cargas laborales'],
    ['Generado', analytics.generatedAt],
    ['Horas estandar mes', analytics.study.standardMonthlyHours],
    ['Horas mes visibles', analytics.study.totalMonthlyHours],
    ['Funcionarios requeridos', analytics.study.requiredStaff167],
    ['Brecha estimada', analytics.study.staffGap167],
    [],
    ['Areas / equipos'],
    ['Area', 'Miembros', 'Horas mes', 'Funcionarios requeridos', 'Brecha', 'ICU %', 'Tareas abiertas', 'Tareas vencidas'],
    ...analytics.teams.map((team) => [
      team.name,
      team.members,
      team.monthlyHours,
      team.staffNeed167,
      team.staffGap167,
      team.rawUtilizationPercent,
      team.openTasks,
      team.overdueTasks,
    ]),
    [],
    ['Colaboradores'],
    ['Usuario', 'Rol', 'Capacidad mensual', 'Horas mes', 'Funcionarios requeridos', 'Carga ponderada', 'ICU ponderado %', 'ICU horas %', 'Tareas abiertas', 'Vencidas', 'Riesgo'],
    ...analytics.users.map((user) => [
      user.name,
      user.role,
      user.capacityHoursPerMonth,
      user.monthlyHours,
      user.staffNeed167,
      user.workloadScore,
      user.utilizationPercent,
      user.rawUtilizationPercent,
      user.openTasks,
      user.overdueTasks,
      user.risk,
    ]),
    [],
    ['Actividades'],
    ['Actividad', 'Area', 'Responsable', 'Periodicidad', 'Repeticiones mes', 'Minutos/repeticion', 'Horas mes', 'Funcionarios requeridos', 'Prioridad', 'Dificultad', 'Estado', 'Riesgo'],
    ...analytics.tasks.map((task) => [
      task.title,
      task.teamName,
      task.assigneeName,
      task.periodicityLabel,
      task.frequencyPerMonth || '',
      task.minutesPerOccurrence || '',
      task.monthlyHours,
      task.staffNeed167,
      task.priority,
      task.difficulty,
      task.status,
      task.risk,
    ]),
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[,"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

module.exports = {
  PRIORITY_WEIGHT,
  DIFFICULTY_WEIGHT,
  WELLBEING_WEIGHT,
  STANDARD_MONTHLY_HOURS,
  daysUntil,
  urgencyWeight,
  taskMonthlyHours,
  taskStaffNeed,
  taskWorkloadScore,
  computeAnalytics,
  toCsvReport,
  round,
};
