export type ProjectHealthStatus = 'red' | 'amber' | 'green';

export interface ProjectHealthInput {
  isClosed?: boolean | number | null;
  isCancelled?: boolean | number | null;
  canViewBudgetInfo: boolean;
  budget?: number | null;
  budgetSpent?: number | null;
  endDate?: string | null;
  overdueTasks?: number | null;
  totalTasks?: number | null;
  unassignedTasks?: number | null;
  overdueMilestones?: number | null;
  upcomingMilestonesSoon?: number | null;
  nextOpenMilestoneDueDate?: string | Date | null;
  activeSprintCount?: number | null;
  overdueActiveSprints?: number | null;
  activeSprintEndDate?: string | Date | null;
}

const toStartOfDay = (value: Date): Date => {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const toDateOrNull = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return toStartOfDay(parsed);
};

export function computeProjectHealth(input: ProjectHealthInput): { status: ProjectHealthStatus; reasons: string[] } {
  if (Number(input.isClosed || 0) === 1 || Number(input.isCancelled || 0) === 1) {
    return { status: 'green', reasons: [] };
  }

  const budgetTotal = Number(input.budget) || 0;
  const budgetSpent = Number(input.budgetSpent) || 0;
  const budgetPct = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;

  const overdueTasks = Number(input.overdueTasks) || 0;
  const totalTasks = Number(input.totalTasks) || 0;
  const unassignedTasks = Number(input.unassignedTasks) || 0;
  const overdueMilestones = Number(input.overdueMilestones) || 0;
  const upcomingMilestonesSoon = Number(input.upcomingMilestonesSoon) || 0;
  const activeSprintCount = Number(input.activeSprintCount) || 0;
  const overdueActiveSprints = Number(input.overdueActiveSprints) || 0;

  const today = toStartOfDay(new Date());
  const endDate = toDateOrNull(input.endDate);
  const nextOpenMilestoneDueDate = toDateOrNull(input.nextOpenMilestoneDueDate);
  const activeSprintEndDate = toDateOrNull(input.activeSprintEndDate);

  const reasons: string[] = [];
  let status: ProjectHealthStatus = 'green';

  if (input.canViewBudgetInfo && budgetTotal > 0 && budgetPct >= 100) {
    status = 'red';
    reasons.push(`Budget exceeded (${budgetPct}%)`);
  }

  if (endDate && endDate < today) {
    status = 'red';
    reasons.push('Past end date');
  }

  if (overdueTasks > 2) {
    status = 'red';
    reasons.push(`${overdueTasks} overdue tasks`);
  }

  if (overdueMilestones > 0) {
    status = 'red';
    reasons.push(`${overdueMilestones} overdue milestone${overdueMilestones === 1 ? '' : 's'}`);
  }

  if (activeSprintCount > 0 && overdueActiveSprints > 0) {
    status = 'red';
    reasons.push(`${overdueActiveSprints} overdue active sprint${overdueActiveSprints === 1 ? '' : 's'}`);
  }

  if (status !== 'red') {
    if (input.canViewBudgetInfo && budgetTotal > 0 && budgetPct >= 80) {
      status = 'amber';
      reasons.push(`Budget at ${budgetPct}%`);
    }

    if (overdueTasks > 0) {
      status = 'amber';
      reasons.push(`${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`);
    }

    if (endDate) {
      const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
      if (daysLeft > 0 && daysLeft <= 7) {
        status = 'amber';
        reasons.push(`Due in ${daysLeft}d`);
      }
    }

    if (totalTasks > 0 && unassignedTasks > totalTasks * 0.3) {
      status = 'amber';
      reasons.push(`${unassignedTasks} unassigned tasks`);
    }

    if (upcomingMilestonesSoon > 0) {
      status = 'amber';
      reasons.push(`${upcomingMilestonesSoon} milestone${upcomingMilestonesSoon === 1 ? '' : 's'} due soon`);
    } else if (nextOpenMilestoneDueDate) {
      const milestoneDaysLeft = Math.ceil((nextOpenMilestoneDueDate.getTime() - today.getTime()) / 86400000);
      if (milestoneDaysLeft > 0 && milestoneDaysLeft <= 7) {
        status = 'amber';
        reasons.push(`Milestone due in ${milestoneDaysLeft}d`);
      }
    }

    if (activeSprintCount > 0 && activeSprintEndDate) {
      const sprintDaysLeft = Math.ceil((activeSprintEndDate.getTime() - today.getTime()) / 86400000);
      if (sprintDaysLeft > 0 && sprintDaysLeft <= 7) {
        status = 'amber';
        reasons.push(`Active sprint ends in ${sprintDaysLeft}d`);
      }
    }
  }

  return { status, reasons };
}
