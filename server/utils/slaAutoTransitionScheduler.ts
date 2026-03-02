import cron, { ScheduledTask } from 'node-cron';
import { pool, RowDataPacket } from '../config/database';
import logger from './logger';

interface SlaRuleWithTransition extends RowDataPacket {
  Id: number;
  OrganizationId: number;
  PriorityId: number | null;
  AutoTransitionHours: number;
  AutoTransitionStatusId: number;
  AutoTransitionStatusName: string | null;
  AutoTransitionStatusIsClosed: number;
}

interface TicketRow extends RowDataPacket {
  Id: number;
  OrganizationId: number;
  PriorityId: number | null;
  StatusId: number | null;
  CreatedAt: Date | string;
  CreatedByUserId: number;
  TicketNumber: string | null;
  CurrentStatusName: string | null;
}

function getCreatedAtDate(createdAt: Date | string): Date | null {
  const parsed = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function getElapsedHours(createdAt: Date, now: Date): number {
  const elapsedMs = now.getTime() - createdAt.getTime();
  return elapsedMs / (1000 * 60 * 60);
}

function findApplicableRule(rules: SlaRuleWithTransition[], priorityId: number | null): SlaRuleWithTransition | null {
  if (rules.length === 0) {
    return null;
  }

  const priorityRule = rules.find((rule) => rule.PriorityId != null && rule.PriorityId === priorityId);
  if (priorityRule) {
    return priorityRule;
  }

  return rules.find((rule) => rule.PriorityId == null) || null;
}

export async function processSlaAutoTransitions(): Promise<void> {
  try {
    logger.info('Running SLA auto-transition scheduler check...');

    const [rulesRows] = await pool.execute<RowDataPacket[]>(
      `SELECT sr.Id, sr.OrganizationId, sr.PriorityId, sr.AutoTransitionHours, sr.AutoTransitionStatusId,
              tsv.StatusName as AutoTransitionStatusName,
              COALESCE(tsv.IsClosed, 0) as AutoTransitionStatusIsClosed
       FROM SLARules sr
       LEFT JOIN TicketStatusValues tsv ON sr.AutoTransitionStatusId = tsv.Id
       WHERE sr.IsActive = 1
         AND sr.AutoTransitionHours IS NOT NULL
         AND sr.AutoTransitionHours > 0
         AND sr.AutoTransitionStatusId IS NOT NULL
       ORDER BY sr.OrganizationId ASC, sr.PriorityId DESC, sr.Id ASC`
    );

    const rules = rulesRows as SlaRuleWithTransition[];
    if (rules.length === 0) {
      logger.info('No active SLA auto-transition rules found');
      return;
    }

    const rulesByOrganization = new Map<number, SlaRuleWithTransition[]>();
    rules.forEach((rule) => {
      const orgRules = rulesByOrganization.get(Number(rule.OrganizationId)) || [];
      orgRules.push(rule);
      rulesByOrganization.set(Number(rule.OrganizationId), orgRules);
    });

    const [ticketsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.OrganizationId, t.PriorityId, t.StatusId, t.CreatedAt, t.CreatedByUserId, t.TicketNumber,
              tsv.StatusName as CurrentStatusName,
              COALESCE(tsv.IsClosed, 0) as CurrentStatusIsClosed
       FROM Tickets t
       LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
       WHERE COALESCE(tsv.IsClosed, 0) = 0
         AND t.CreatedAt IS NOT NULL`
    );

    const tickets = ticketsRows as TicketRow[];
    if (tickets.length === 0) {
      logger.info('No open tickets found for SLA auto-transition check');
      return;
    }

    const now = new Date();
    let transitionsCount = 0;

    for (const ticket of tickets) {
      const orgRules = rulesByOrganization.get(Number(ticket.OrganizationId)) || [];
      if (orgRules.length === 0) {
        continue;
      }

      const applicableRule = findApplicableRule(orgRules, ticket.PriorityId ?? null);
      if (!applicableRule) {
        continue;
      }

      const createdAt = getCreatedAtDate(ticket.CreatedAt);
      if (!createdAt) {
        continue;
      }

      const elapsedHours = getElapsedHours(createdAt, now);
      if (elapsedHours < Number(applicableRule.AutoTransitionHours)) {
        continue;
      }

      const targetStatusId = Number(applicableRule.AutoTransitionStatusId);
      if ((ticket.StatusId ?? null) === targetStatusId) {
        continue;
      }

      const targetIsClosed = Number(applicableRule.AutoTransitionStatusIsClosed || 0) === 1;

      if (targetIsClosed) {
        await pool.execute(
          `UPDATE Tickets
           SET StatusId = ?,
               UpdatedAt = ?,
               ResolvedAt = COALESCE(ResolvedAt, ?),
               ClosedAt = COALESCE(ClosedAt, ?)
           WHERE Id = ?`,
          [targetStatusId, now, now, now, ticket.Id]
        );
      } else {
        await pool.execute(
          `UPDATE Tickets
           SET StatusId = ?,
               UpdatedAt = ?
           WHERE Id = ?`,
          [targetStatusId, now, ticket.Id]
        );
      }

      await pool.execute(
        `INSERT INTO TicketHistory (TicketId, UserId, Action, FieldName, OldValue, NewValue)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          ticket.Id,
          Number(ticket.CreatedByUserId),
          'SlaAutoStatusChange',
          'Status',
          ticket.CurrentStatusName || '',
          applicableRule.AutoTransitionStatusName || `Status ${targetStatusId}`,
        ]
      );

      transitionsCount += 1;
    }

    logger.info(`SLA auto-transition check completed: ${transitionsCount} ticket(s) updated`);
  } catch (error) {
    logger.error('Error in SLA auto-transition scheduler:', error);
  }
}

let schedulerTask: ScheduledTask | null = null;
let isSchedulerRunning = false;

const runSlaSchedulerSafely = async (): Promise<void> => {
  if (isSchedulerRunning) {
    logger.warn('SLA auto-transition scheduler run skipped because previous run is still in progress');
    return;
  }

  isSchedulerRunning = true;
  try {
    await processSlaAutoTransitions();
  } catch (error) {
    logger.error('SLA auto-transition scheduler run failed:', error);
  } finally {
    isSchedulerRunning = false;
  }
};

export function startSlaAutoTransitionScheduler(): void {
  if (schedulerTask) {
    return;
  }

  logger.info('Starting SLA auto-transition scheduler...');

  runSlaSchedulerSafely().catch(err =>
    logger.error('Initial SLA auto-transition scheduler run failed:', err)
  );

  schedulerTask = cron.schedule('*/10 * * * *', () => {
    runSlaSchedulerSafely().catch(err =>
      logger.error('SLA auto-transition scheduler cron run failed:', err)
    );
  });

  logger.info('SLA auto-transition scheduler started (cron: every 10 minutes)');
}

export function stopSlaAutoTransitionScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    logger.info('SLA auto-transition scheduler stopped');
  }
}
