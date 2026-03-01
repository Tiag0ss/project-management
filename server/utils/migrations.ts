import { dbProvider, pool, RowDataPacket } from '../config/database';
import logger from './logger';

const isMssql = dbProvider === 'mssql';

function isMissingTableError(error: any): boolean {
  const mysqlMissing = error?.code === 'ER_NO_SUCH_TABLE';
  const mssqlNumber = error?.number ?? error?.originalError?.info?.number;
  const mssqlMissing = mssqlNumber === 208;
  return mysqlMissing || mssqlMissing;
}

function isIntegerType(dataType: string | null): boolean {
  if (!dataType) return false;
  const normalized = dataType.toLowerCase();
  return ['int', 'bigint', 'smallint', 'tinyint'].includes(normalized);
}

function isTextualType(dataType: string | null): boolean {
  if (!dataType) return false;
  const normalized = dataType.toLowerCase();
  return ['varchar', 'nvarchar', 'text', 'ntext', 'mediumtext', 'longtext'].includes(normalized);
}

/**
 * Get the data type of a column in a table.
 * Returns the DATA_TYPE (e.g., 'varchar', 'int') or null if not found.
 */
async function getColumnDataType(tableName: string, columnName: string): Promise<string | null> {
  try {
    const query = isMssql
      ? `SELECT DATA_TYPE FROM information_schema.columns 
         WHERE table_schema = ? AND table_name = ? AND column_name = ?`
      : `SELECT DATA_TYPE FROM information_schema.columns 
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`;

    const params = isMssql ? ['dbo', tableName, columnName] : [tableName, columnName];
    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows.length > 0 ? String(rows[0].DATA_TYPE || '').toLowerCase() : null;
  } catch (error) {
    return null;
  }
}

/**
 * Migration: Convert Tasks.Status, Tasks.Priority, and Projects.Status
 * from varchar (text names) to int (FK IDs referencing status/priority value tables).
 * 
 * This migration is idempotent — it checks column types before running
 * and only executes if columns are still varchar.
 */
async function migrateStatusPriorityToIds(): Promise<void> {
  const tasksStatusType = await getColumnDataType('Tasks', 'Status');
  const tasksPriorityType = await getColumnDataType('Tasks', 'Priority');
  const projectsStatusType = await getColumnDataType('Projects', 'Status');

  if (isIntegerType(tasksStatusType) && isIntegerType(tasksPriorityType) && isIntegerType(projectsStatusType)) {
    return;
  }

  logger.info('⚡ Running migration: Convert Status/Priority from text to FK IDs...');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Convert Tasks.Status (text → ID from TaskStatusValues)
    if (isTextualType(tasksStatusType)) {
      logger.info('  Converting Tasks.Status from varchar to int...');

      await connection.execute<any>(
        isMssql
          ? `UPDATE t
             SET t.Status = tsv.Id
             FROM Tasks t
             INNER JOIN Projects p ON t.ProjectId = p.Id
             INNER JOIN TaskStatusValues tsv ON tsv.StatusName = t.Status AND tsv.OrganizationId = p.OrganizationId`
          : `UPDATE Tasks t
             INNER JOIN Projects p ON t.ProjectId = p.Id
             INNER JOIN TaskStatusValues tsv ON tsv.StatusName = t.Status AND tsv.OrganizationId = p.OrganizationId
             SET t.Status = tsv.Id`
      );
      logger.info('    ✓ Converted task status values to IDs');

      await connection.execute(
        isMssql
          ? `UPDATE Tasks SET Status = NULL WHERE Status IS NOT NULL AND TRY_CONVERT(INT, Status) IS NULL`
          : `UPDATE Tasks SET Status = NULL WHERE Status IS NOT NULL AND Status NOT REGEXP '^[0-9]+$'`
      );

      await connection.execute(
        isMssql
          ? `ALTER TABLE Tasks ALTER COLUMN Status int NULL`
          : `ALTER TABLE Tasks MODIFY COLUMN Status int NULL`
      );
      logger.info('    ✓ Tasks.Status column changed to int');
    }

    // 2. Convert Tasks.Priority (text → ID from TaskPriorityValues)
    if (isTextualType(tasksPriorityType)) {
      logger.info('  Converting Tasks.Priority from varchar to int...');

      await connection.execute<any>(
        isMssql
          ? `UPDATE t
             SET t.Priority = tpv.Id
             FROM Tasks t
             INNER JOIN Projects p ON t.ProjectId = p.Id
             INNER JOIN TaskPriorityValues tpv ON tpv.PriorityName = t.Priority AND tpv.OrganizationId = p.OrganizationId`
          : `UPDATE Tasks t
             INNER JOIN Projects p ON t.ProjectId = p.Id
             INNER JOIN TaskPriorityValues tpv ON tpv.PriorityName = t.Priority AND tpv.OrganizationId = p.OrganizationId
             SET t.Priority = tpv.Id`
      );
      logger.info('    ✓ Converted task priority values to IDs');

      await connection.execute(
        isMssql
          ? `UPDATE Tasks SET Priority = NULL WHERE Priority IS NOT NULL AND TRY_CONVERT(INT, Priority) IS NULL`
          : `UPDATE Tasks SET Priority = NULL WHERE Priority IS NOT NULL AND Priority NOT REGEXP '^[0-9]+$'`
      );

      await connection.execute(
        isMssql
          ? `ALTER TABLE Tasks ALTER COLUMN Priority int NULL`
          : `ALTER TABLE Tasks MODIFY COLUMN Priority int NULL`
      );
      logger.info('    ✓ Tasks.Priority column changed to int');
    }

    // 3. Convert Projects.Status (text → ID from ProjectStatusValues)
    if (isTextualType(projectsStatusType)) {
      logger.info('  Converting Projects.Status from varchar to int...');

      await connection.execute<any>(
        isMssql
          ? `UPDATE p
             SET p.Status = psv.Id
             FROM Projects p
             INNER JOIN ProjectStatusValues psv ON psv.StatusName = p.Status AND psv.OrganizationId = p.OrganizationId`
          : `UPDATE Projects p
             INNER JOIN ProjectStatusValues psv ON psv.StatusName = p.Status AND psv.OrganizationId = p.OrganizationId
             SET p.Status = psv.Id`
      );
      logger.info('    ✓ Converted project status values to IDs');

      await connection.execute(
        isMssql
          ? `UPDATE Projects SET Status = NULL WHERE Status IS NOT NULL AND TRY_CONVERT(INT, Status) IS NULL`
          : `UPDATE Projects SET Status = NULL WHERE Status IS NOT NULL AND Status NOT REGEXP '^[0-9]+$'`
      );

      await connection.execute(
        isMssql
          ? `ALTER TABLE Projects ALTER COLUMN Status int NULL`
          : `ALTER TABLE Projects MODIFY COLUMN Status int NULL`
      );
      logger.info('    ✓ Projects.Status column changed to int');
    }

    await connection.commit();
    logger.info('✓ Migration complete: Status/Priority columns converted to FK IDs');
  } catch (error: any) {
    await connection.rollback();
    if (isMissingTableError(error)) {
      logger.info('  ℹ Tables not yet created, migration will run on next startup');
      return;
    }
    logger.error('✗ Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Migration: Allow TicketNumber to be NULL temporarily during insertion.
 * The code generates the ticket number after insertion based on the ticket ID.
 * 
 * This migration is idempotent.
 */
async function migrateTicketNumberToNullable(): Promise<void> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      isMssql
        ? `SELECT IS_NULLABLE FROM information_schema.columns 
           WHERE table_schema = ? AND table_name = 'Tickets' AND column_name = 'TicketNumber'`
        : `SELECT IS_NULLABLE FROM information_schema.columns 
           WHERE table_schema = DATABASE() AND table_name = 'Tickets' AND column_name = 'TicketNumber'`,
      isMssql ? ['dbo'] : []
    );
    
    if (rows.length === 0 || rows[0].IS_NULLABLE === 'YES') {
      return; // Column doesn't exist or already nullable
    }

    logger.info('⚡ Running migration: Allow TicketNumber to be NULL...');
    
    await pool.execute(
      isMssql
        ? `ALTER TABLE Tickets ALTER COLUMN TicketNumber nvarchar(20) NULL`
        : `ALTER TABLE Tickets MODIFY COLUMN TicketNumber varchar(20) NULL`
    );
    logger.info('  ✓ TicketNumber → NULL allowed');
    logger.info('✓ Migration complete: TicketNumber now allows NULL');
  } catch (error: any) {
    if (isMissingTableError(error)) {
      logger.info('  ℹ Tables not yet created, migration will run on next startup');
      return;
    }
    logger.error('✗ Migration failed:', error);
    throw error;
  }
}

/**
 * Migration: Convert Description and Comment fields from text to mediumtext
 * to support base64 images in rich text editor.
 * 
 * This migration is idempotent.
 */
async function migrateDescriptionToMediumtext(): Promise<void> {
  const tasksDescType = await getColumnDataType('Tasks', 'Description');
  const ticketsDescType = await getColumnDataType('Tickets', 'Description');
  const taskCommentsType = await getColumnDataType('TaskComments', 'Comment');
  const ticketCommentsType = await getColumnDataType('TicketComments', 'Comment');

  const targetType = isMssql ? 'nvarchar' : 'mediumtext';

  if (!isMssql && tasksDescType === 'mediumtext' && ticketsDescType === 'mediumtext' && 
      taskCommentsType === 'mediumtext' && ticketCommentsType === 'mediumtext') {
    return;
  }

  if (isMssql && tasksDescType === targetType && ticketsDescType === targetType && 
      taskCommentsType === targetType && ticketCommentsType === targetType) {
    return;
  }

  logger.info('⚡ Running migration: Convert Description/Comment fields to mediumtext...');

  try {
    const needsTasksDesc = isMssql ? tasksDescType !== 'nvarchar' : tasksDescType !== 'mediumtext';
    const needsTicketsDesc = isMssql ? ticketsDescType !== 'nvarchar' : ticketsDescType !== 'mediumtext';
    const needsTaskComments = isMssql ? taskCommentsType !== 'nvarchar' : taskCommentsType !== 'mediumtext';
    const needsTicketComments = isMssql ? ticketCommentsType !== 'nvarchar' : ticketCommentsType !== 'mediumtext';

    if (needsTasksDesc) {
      await pool.execute(
        isMssql
          ? `ALTER TABLE Tasks ALTER COLUMN Description nvarchar(max) NULL`
          : `ALTER TABLE Tasks MODIFY COLUMN Description mediumtext NULL`
      );
      logger.info(`  ✓ Tasks.Description → ${isMssql ? 'nvarchar(max)' : 'mediumtext'}`);
    }

    if (needsTicketsDesc) {
      await pool.execute(
        isMssql
          ? `ALTER TABLE Tickets ALTER COLUMN Description nvarchar(max) NULL`
          : `ALTER TABLE Tickets MODIFY COLUMN Description mediumtext NULL`
      );
      logger.info(`  ✓ Tickets.Description → ${isMssql ? 'nvarchar(max)' : 'mediumtext'}`);
    }

    if (needsTaskComments) {
      await pool.execute(
        isMssql
          ? `ALTER TABLE TaskComments ALTER COLUMN Comment nvarchar(max) NOT NULL`
          : `ALTER TABLE TaskComments MODIFY COLUMN Comment mediumtext NOT NULL`
      );
      logger.info(`  ✓ TaskComments.Comment → ${isMssql ? 'nvarchar(max)' : 'mediumtext'}`);
    }

    if (needsTicketComments) {
      await pool.execute(
        isMssql
          ? `ALTER TABLE TicketComments ALTER COLUMN Comment nvarchar(max) NOT NULL`
          : `ALTER TABLE TicketComments MODIFY COLUMN Comment mediumtext NOT NULL`
      );
      logger.info(`  ✓ TicketComments.Comment → ${isMssql ? 'nvarchar(max)' : 'mediumtext'}`);
    }

    logger.info('✓ Migration complete: Description/Comment fields converted to mediumtext');
  } catch (error: any) {
    if (isMissingTableError(error)) {
      logger.info('  ℹ Tables not yet created, migration will run on next startup');
      return;
    }
    logger.error('✗ Migration failed:', error);
    throw error;
  }
}

/**
 * Run all pending database migrations.
 * Called during server startup after buildAllTables.
 * All migrations must be idempotent (safe to run multiple times).
 */
export async function runMigrations(): Promise<void> {
  logger.info(`=== Running Database Migrations (${dbProvider}) ===`);

  try {
    await migrateStatusPriorityToIds();
    await migrateTicketNumberToNullable();
    await migrateDescriptionToMediumtext();
    logger.info('=== Migrations Complete ===');
  } catch (error) {
    logger.error('Migration error:', error);
    throw error;
  }
}
