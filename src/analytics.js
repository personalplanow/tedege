'use strict';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function taskWorkloadScore(task, now = new Date()) {
  if (task.status === 'done' || task.status === 'cancelled') return 0;
  const estimated = Math.max(Number(task.estimatedHours || 0), 0);
  const score = estimated
    * (PRIORITY_WEIGHT[task.priority] || PRIORITY_WEIGHT.medium)
    * (DIFFICULTY_WEIGHT[task.difficulty] || DIFFICULTY_WEIGHT.medium)
    * urgencyWeight(task, now)
    * (WELLBEING_WEIGHT[task.wellbeingSignal] || WELLBEING_WEIGHT.neutral);
  return round(score, 2);
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

function userRisk(utilization, user) {
  const stress = user.wellbeing?.stress || 0;
  const fatigue = user.wellbeing?.fatigue || 0;
  if (utilization >= 1 || stress >= 4.5 || fatigue >= 4.5) return 'critical';
  if (utilization >= 0.85 || stress >= 4 || fatigue >= 4) return 'high';
  if (utilization >= 0.6 || stress >= 3 || fatigue >= 3) return 'medium';
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
  const visibleUsers = getVisibleUsers(state, currentUser);
  const visibleUserIds = new Set(visibleUsers.map((user) => user.id));
  const visibleTasks = state.tasks.filter((task) => isTaskVisible(task, currentUser, visibleUserIds));
  const activeTasks = visibleTasks.filter((task) => !['done', 'cancelled'].includes(task.status));
  const completedTasks = visibleTasks.filter((task) => task.status === 'done');

  const userScores = visibleUsers.map((user) => {
    const userTasks = state.tasks.filter((task) => task.assigneeId === user.id && !['done', 'cancelled'].includes(task.status));
    const workload = userTasks.reduce((sum, task) => sum + taskWorkloadScore(task, now), 0);
    const capacity = Math.max(Number(user.capacityHoursPerWeek || 40), 1);
    const utilization = workload / capacity;
    const highPriorityTasks = userTasks.filter((task) => ['high', 'critical'].includes(task.priority)).length;
    const overdueTasks = userTasks.filter((task) => daysUntil(task.dueDate, now) < 0).length;
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teamIds: user.teamIds || [],
      skills: user.skills || [],
      capacityHoursPerWeek: capacity,
      workloadScore: round(workload, 2),
      utilization: round(utilization, 3),
      utilizationPercent: round(utilization * 100, 1),
      openTasks: userTasks.length,
      highPriorityTasks,
      overdueTasks,
      wellbeing: user.wellbeing || {},
      risk: userRisk(utilization, user),
    };
  });

  const utilizationByUser = new Map(userScores.map((score) => [score.userId, score.utilization]));
  const tasksWithMetrics = visibleTasks.map((task) => {
    const assignee = state.users.find((user) => user.id === task.assigneeId);
    const team = state.teams.find((item) => item.id === task.teamId);
    const cp = taskWorkloadScore(task, now);
    const risk = taskRisk(task, assignee, utilizationByUser.get(task.assigneeId) || 0, now);
    return {
      ...task,
      assigneeName: assignee?.name || 'Sin responsable',
      teamName: team?.name || 'Sin equipo',
      workloadScore: cp,
      urgencyWeight: round(urgencyWeight(task, now), 2),
      daysUntilDue: daysUntil(task.dueDate, now),
      risk,
      commentsCount: state.comments.filter((comment) => comment.taskId === task.id).length,
    };
  });

  const totalWorkload = activeTasks.reduce((sum, task) => sum + taskWorkloadScore(task, now), 0);
  const totalCapacity = visibleUsers.reduce((sum, user) => sum + Number(user.capacityHoursPerWeek || 40), 0);
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
      const capacity = teamUsers.reduce((sum, user) => sum + user.capacityHoursPerWeek, 0) || 1;
      return {
        teamId: team.id,
        name: team.name,
        members: teamUsers.length,
        openTasks: teamTasks.length,
        workloadScore: round(workload, 2),
        utilizationPercent: round((workload / capacity) * 100, 1),
        overdueTasks: teamTasks.filter((task) => task.daysUntilDue < 0).length,
      };
    });

  const recommendations = buildRecommendations(state, userScores, tasksWithMetrics, currentUser, now);

  return {
    brand: state.meta.brand,
    generatedAt: now.toISOString(),
    summary: {
      totalVisibleUsers: visibleUsers.length,
      activeTasks: activeTasks.length,
      completedTasks: completedTasks.length,
      totalWorkload: round(totalWorkload, 2),
      totalCapacity: round(totalCapacity, 2),
      averageUtilizationPercent: totalCapacity ? round((totalWorkload / totalCapacity) * 100, 1) : 0,
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
  const userScoreMap = new Map(userScores.map((user) => [user.userId, user]));
  const usersById = new Map(state.users.map((user) => [user.id, user]));
  const visibleUserIds = new Set(userScores.map((user) => user.userId));
  const recommendations = [];
  const overloaded = userScores
    .filter((user) => user.utilization >= 0.85)
    .sort((a, b) => b.utilization - a.utilization);

  for (const source of overloaded) {
    const sourceTasks = tasksWithMetrics
      .filter((task) => task.assigneeId === source.userId && !['done', 'cancelled'].includes(task.status))
      .sort((a, b) => b.workloadScore - a.workloadScore);

    for (const task of sourceTasks) {
      const candidates = userScores
        .filter((candidate) => candidate.userId !== source.userId)
        .filter((candidate) => candidate.utilization < 0.8)
        .filter((candidate) => visibleUserIds.has(candidate.userId))
        .filter((candidate) => {
          const raw = usersById.get(candidate.userId);
          return raw?.skills?.includes(task.requiredSkill) || raw?.skills?.includes('general');
        })
        .sort((a, b) => a.utilization - b.utilization);
      const target = candidates[0];
      if (!target) continue;

      const targetAfter = (target.workloadScore + task.workloadScore) / target.capacityHoursPerWeek;
      const sourceAfter = (source.workloadScore - task.workloadScore) / source.capacityHoursPerWeek;
      if (targetAfter > 0.95) continue;

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
        severity: source.utilization >= 1 ? 'critical' : 'preventive',
        confidence: calculateConfidence(task, source, target),
        explanation: [
          `${source.name} registra ${round(source.utilizationPercent, 1)}% de capacidad utilizada.`,
          `${target.name} tiene ${round(target.utilizationPercent, 1)}% y habilidad compatible: ${task.requiredSkill}.`,
          `La tarea pesa ${task.workloadScore} puntos de carga ponderada y vence en ${task.daysUntilDue} día(s).`,
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
        task.daysUntilDue < 0 ? 'La tarea se encuentra vencida.' : `La tarea vence en ${task.daysUntilDue} día(s).`,
        `Prioridad ${task.priority}, dificultad ${task.difficulty}, carga ponderada ${task.workloadScore}.`,
      ],
    }));

  return [...recommendations, ...taskAlerts].slice(0, 12);
}

function calculateConfidence(task, source, target) {
  let confidence = 0.65;
  if (target.utilization < 0.5) confidence += 0.12;
  if (task.requiredSkill && target.skills?.includes(task.requiredSkill)) confidence += 0.12;
  if (source.utilization >= 1) confidence += 0.08;
  if (task.daysUntilDue <= 3) confidence += 0.03;
  return round(Math.min(confidence, 0.95), 2);
}

function toCsvReport(analytics) {
  const rows = [
    ['Usuario', 'Rol', 'Capacidad semanal', 'Carga ponderada', 'Utilizacion %', 'Tareas abiertas', 'Tareas vencidas', 'Riesgo'],
    ...analytics.users.map((user) => [
      user.name,
      user.role,
      user.capacityHoursPerWeek,
      user.workloadScore,
      user.utilizationPercent,
      user.openTasks,
      user.overdueTasks,
      user.risk,
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
  daysUntil,
  urgencyWeight,
  taskWorkloadScore,
  computeAnalytics,
  toCsvReport,
  round,
};
