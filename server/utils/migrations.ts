import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import logger from './logger';

/**
 * Get the data type of a column in a table.
 * Returns the DATA_TYPE (e.g., 'varchar', 'int') or null if not found.
 */
async function getColumnDataType(tableName: string, columnName: string): Promise<string | null> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DATA_TYPE FROM information_schema.columns 
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [tableName, columnName]
    );
    return rows.length > 0 ? rows[0].DATA_TYPE : null;
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

  // If all columns are already int, nothing to do
  if (tasksStatusType === 'int' && tasksPriorityType === 'int' && projectsStatusType === 'int') {
    return;
  }

  logger.info('⚡ Running migration: Convert Status/Priority from text to FK IDs...');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Convert Tasks.Status (text → ID from TaskStatusValues)
    if (tasksStatusType === 'varchar') {
      logger.info('  Converting Tasks.Status from varchar to int...');

      // First, convert matching text values to IDs
      const [statusResult] = await connection.execute<any>(
        `UPDATE Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         INNER JOIN TaskStatusValues tsv ON tsv.StatusName = t.Status AND tsv.OrganizationId = p.OrganizationId
         SET t.Status = tsv.Id`
      );
      logger.info(`    ✓ Converted ${statusResult.affectedRows} task status values to IDs`);

      // Set NULL for any that didn't match (orphaned text values)
      await connection.execute(
        `UPDATE Tasks SET Status = NULL WHERE Status IS NOT NULL AND Status NOT REGEXP '^[0-9]+$'`
      );

      // ALTER column type
      await connection.execute(`ALTER TABLE Tasks MODIFY COLUMN Status int NULL`);
      logger.info('    ✓ Tasks.Status column changed to int');
    }

    // 2. Convert Tasks.Priority (text → ID from TaskPriorityValues)
    if (tasksPriorityType === 'varchar') {
      logger.info('  Converting Tasks.Priority from varchar to int...');

      const [priorityResult] = await connection.execute<any>(
        `UPDATE Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         INNER JOIN TaskPriorityValues tpv ON tpv.PriorityName = t.Priority AND tpv.OrganizationId = p.OrganizationId
         SET t.Priority = tpv.Id`
      );
      logger.info(`    ✓ Converted ${priorityResult.affectedRows} task priority values to IDs`);

      await connection.execute(
        `UPDATE Tasks SET Priority = NULL WHERE Priority IS NOT NULL AND Priority NOT REGEXP '^[0-9]+$'`
      );

      await connection.execute(`ALTER TABLE Tasks MODIFY COLUMN Priority int NULL`);
      logger.info('    ✓ Tasks.Priority column changed to int');
    }

    // 3. Convert Projects.Status (text → ID from ProjectStatusValues)
    if (projectsStatusType === 'varchar') {
      logger.info('  Converting Projects.Status from varchar to int...');

      const [projectResult] = await connection.execute<any>(
        `UPDATE Projects p
         INNER JOIN ProjectStatusValues psv ON psv.StatusName = p.Status AND psv.OrganizationId = p.OrganizationId
         SET p.Status = psv.Id`
      );
      logger.info(`    ✓ Converted ${projectResult.affectedRows} project status values to IDs`);

      await connection.execute(
        `UPDATE Projects SET Status = NULL WHERE Status IS NOT NULL AND Status NOT REGEXP '^[0-9]+$'`
      );

      await connection.execute(`ALTER TABLE Projects MODIFY COLUMN Status int NULL`);
      logger.info('    ✓ Projects.Status column changed to int');
    }

    await connection.commit();
    logger.info('✓ Migration complete: Status/Priority columns converted to FK IDs');
  } catch (error: any) {
    await connection.rollback();
    // If tables don't exist yet (fresh install), ignore gracefully
    if (error.code === 'ER_NO_SUCH_TABLE') {
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
      `SELECT IS_NULLABLE FROM information_schema.columns 
       WHERE table_schema = DATABASE() AND table_name = 'Tickets' AND column_name = 'TicketNumber'`
    );
    
    if (rows.length === 0 || rows[0].IS_NULLABLE === 'YES') {
      return; // Column doesn't exist or already nullable
    }

    logger.info('⚡ Running migration: Allow TicketNumber to be NULL...');
    
    await pool.execute(`ALTER TABLE Tickets MODIFY COLUMN TicketNumber varchar(20) NULL`);
    logger.info('  ✓ TicketNumber → NULL allowed');
    logger.info('✓ Migration complete: TicketNumber now allows NULL');
  } catch (error: any) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
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

  // If all columns are already mediumtext, nothing to do
  if (tasksDescType === 'mediumtext' && ticketsDescType === 'mediumtext' && 
      taskCommentsType === 'mediumtext' && ticketCommentsType === 'mediumtext') {
    return;
  }

  logger.info('⚡ Running migration: Convert Description/Comment fields to mediumtext...');

  try {
    if (tasksDescType !== 'mediumtext') {
      await pool.execute(`ALTER TABLE Tasks MODIFY COLUMN Description mediumtext NULL`);
      logger.info('  ✓ Tasks.Description → mediumtext');
    }

    if (ticketsDescType !== 'mediumtext') {
      await pool.execute(`ALTER TABLE Tickets MODIFY COLUMN Description mediumtext NULL`);
      logger.info('  ✓ Tickets.Description → mediumtext');
    }

    if (taskCommentsType !== 'mediumtext') {
      await pool.execute(`ALTER TABLE TaskComments MODIFY COLUMN Comment mediumtext NOT NULL`);
      logger.info('  ✓ TaskComments.Comment → mediumtext');
    }

    if (ticketCommentsType !== 'mediumtext') {
      await pool.execute(`ALTER TABLE TicketComments MODIFY COLUMN Comment mediumtext NOT NULL`);
      logger.info('  ✓ TicketComments.Comment → mediumtext');
    }

    logger.info('✓ Migration complete: Description/Comment fields converted to mediumtext');
  } catch (error: any) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
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
  logger.info('=== Running Database Migrations ===');

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
