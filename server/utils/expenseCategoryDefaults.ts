import { pool, RowDataPacket, ResultSetHeader } from '../config/database';
import logger from './logger';

export const DEFAULT_EXPENSE_CATEGORY_CATALOGUE: Array<{
  groupName: string;
  color: string;
  order: number;
  isDefault: number;
  categories: Array<{ name: string; color: string; order: number; isDefault: number }>;
}> = [
  {
    groupName: 'Travel',
    color: '#3b82f6',
    order: 1,
    isDefault: 1,
    categories: [
      { name: 'Flights', color: '#2563eb', order: 1, isDefault: 0 },
      { name: 'Accommodation', color: '#1d4ed8', order: 2, isDefault: 0 },
      { name: 'Meals', color: '#60a5fa', order: 3, isDefault: 1 },
      { name: 'Local transport', color: '#93c5fd', order: 4, isDefault: 0 },
    ],
  },
  {
    groupName: 'Operating',
    color: '#10b981',
    order: 2,
    isDefault: 0,
    categories: [
      { name: 'Office supplies', color: '#059669', order: 1, isDefault: 0 },
      { name: 'Software subscriptions', color: '#34d399', order: 2, isDefault: 0 },
      { name: 'Utilities', color: '#6ee7b7', order: 3, isDefault: 0 },
    ],
  },
  {
    groupName: 'Equipment',
    color: '#f59e0b',
    order: 3,
    isDefault: 0,
    categories: [
      { name: 'Hardware', color: '#d97706', order: 1, isDefault: 0 },
      { name: 'Software licenses', color: '#fbbf24', order: 2, isDefault: 0 },
    ],
  },
  {
    groupName: 'People',
    color: '#8b5cf6',
    order: 4,
    isDefault: 0,
    categories: [
      { name: 'Training', color: '#7c3aed', order: 1, isDefault: 0 },
      { name: 'Recruitment', color: '#a78bfa', order: 2, isDefault: 0 },
    ],
  },
  {
    groupName: 'Other',
    color: '#6b7280',
    order: 5,
    isDefault: 0,
    categories: [
      { name: 'Miscellaneous', color: '#9ca3af', order: 1, isDefault: 0 },
    ],
  },
];

/** In-process lock so parallel GETs (groups + categories) do not double-seed. */
const ensureInFlight = new Map<number, Promise<void>>();

/**
 * Merge duplicate groups/categories created by concurrent seeds.
 * Keeps the lowest Id; re-points categories and expenses before delete.
 */
async function dedupeExpenseTaxonomy(orgId: number): Promise<void> {
  const [dupGroups] = await pool.execute<RowDataPacket[]>(
    `SELECT GroupName, MIN(Id) AS KeepId, COUNT(*) AS Cnt
     FROM ExpenseCategoryGroups
     WHERE OrganizationId = ?
     GROUP BY GroupName
     HAVING COUNT(*) > 1`,
    [orgId]
  );

  for (const row of dupGroups) {
    const keepId = Number(row.KeepId);
    const [extras] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM ExpenseCategoryGroups
       WHERE OrganizationId = ? AND GroupName = ? AND Id != ?`,
      [orgId, row.GroupName, keepId]
    );
    for (const extra of extras) {
      const extraId = Number(extra.Id);
      await pool.execute(
        'UPDATE ExpenseCategoryValues SET GroupId = ? WHERE GroupId = ? AND OrganizationId = ?',
        [keepId, extraId, orgId]
      );
      await pool.execute('DELETE FROM ExpenseCategoryGroups WHERE Id = ?', [extraId]);
    }
  }

  const [dupCats] = await pool.execute<RowDataPacket[]>(
    `SELECT GroupId, CategoryName, MIN(Id) AS KeepId, COUNT(*) AS Cnt
     FROM ExpenseCategoryValues
     WHERE OrganizationId = ?
     GROUP BY GroupId, CategoryName
     HAVING COUNT(*) > 1`,
    [orgId]
  );

  for (const row of dupCats) {
    const keepId = Number(row.KeepId);
    const [extras] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM ExpenseCategoryValues
       WHERE OrganizationId = ? AND GroupId = ? AND CategoryName = ? AND Id != ?`,
      [orgId, row.GroupId, row.CategoryName, keepId]
    );
    for (const extra of extras) {
      const extraId = Number(extra.Id);
      await pool.execute(
        'UPDATE Expenses SET CategoryId = ? WHERE CategoryId = ?',
        [keepId, extraId]
      );
      await pool.execute('DELETE FROM ExpenseCategoryValues WHERE Id = ?', [extraId]);
    }
  }

  if (dupGroups.length > 0 || dupCats.length > 0) {
    logger.info('Deduped expense category taxonomy', {
      orgId,
      groupsMerged: dupGroups.length,
      categoriesMerged: dupCats.length,
    });
  }
}

async function seedExpenseCategoryDefaults(orgId: number): Promise<void> {
  await dedupeExpenseTaxonomy(orgId);

  const [existing] = await pool.execute<RowDataPacket[]>(
    'SELECT Id FROM ExpenseCategoryGroups WHERE OrganizationId = ? LIMIT 1',
    [orgId]
  );
  if (existing.length > 0) return;

  for (const group of DEFAULT_EXPENSE_CATEGORY_CATALOGUE) {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ExpenseCategoryGroups
       (OrganizationId, GroupName, ColorCode, SortOrder, IsDefault)
       VALUES (?, ?, ?, ?, ?)`,
      [orgId, group.groupName, group.color, group.order, group.isDefault]
    );
    const groupId = result.insertId;

    for (const cat of group.categories) {
      await pool.execute(
        `INSERT INTO ExpenseCategoryValues
         (OrganizationId, GroupId, CategoryName, ColorCode, SortOrder, IsDefault)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orgId, groupId, cat.name, cat.color, cat.order, cat.isDefault]
      );
    }
  }
}

/**
 * Insert default expense category groups and categories for an organization.
 * Idempotent and safe under concurrent callers (e.g. parallel group + category GETs).
 */
export async function ensureExpenseCategoryDefaults(orgId: number): Promise<void> {
  const pending = ensureInFlight.get(orgId);
  if (pending) {
    await pending;
    return;
  }

  const work = (async () => {
    try {
      await seedExpenseCategoryDefaults(orgId);
    } catch (error) {
      logger.error('Failed to ensure expense category defaults', {
        orgId,
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      ensureInFlight.delete(orgId);
    }
  })();

  ensureInFlight.set(orgId, work);
  await work;
}
