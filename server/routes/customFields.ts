import { Router, Response } from 'express';
import { pool, RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';
import logger from '../utils/logger';

const router = Router();

// Custom field interface
interface CustomField extends RowDataPacket {
  Id: number;
  TableName: string;
  FieldName: string;
  DisplayName: string;
  GroupName: string | null;
  DataType: string;
  IsRequired: boolean;
  Description: string;
  CreatedAt: Date;
  CreatedBy: number;
  IsActive: boolean;
}

// Available tables for custom fields
const AVAILABLE_TABLES = ['Users', 'Projects', 'Tasks', 'Organizations', 'Customers', 'Tickets', 'TimeEntries', 'CallRecords'];

// Get all custom fields (optionally filtered by table)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const payload = await cachedJson(
      cacheKeys.orgCustomFields('all'),
      ENTITY_TTL_SECONDS,
      async () => {
        const [customFields] = await pool.execute<CustomField[]>(
          'SELECT * FROM CustomFields WHERE IsActive = 1 ORDER BY TableName, COALESCE(GroupName, \"\"), FieldName'
        );
        return { success: true, customFields };
      }
    );

    res.json(payload);
  } catch (error: any) {
    logger.error('Error fetching custom fields:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch custom fields' });
  }
});

// Get custom fields for a specific table
router.get('/:tableName', authenticateToken, async (req: AuthRequest, res: Response) => {
  const tableName = typeof req.params.tableName === 'string' ? req.params.tableName : '';

  try {
    if (!AVAILABLE_TABLES.includes(tableName)) {
      return res.status(400).json({ success: false, message: 'Invalid table name' });
    }

    const payload = await cachedJson(
      cacheKeys.orgCustomFields(`table:${tableName}`),
      ENTITY_TTL_SECONDS,
      async () => {
        const [customFields] = await pool.execute<CustomField[]>(
          'SELECT * FROM CustomFields WHERE TableName = ? AND IsActive = 1 ORDER BY COALESCE(GroupName, \"\"), FieldName',
          [tableName]
        );
        return { success: true, customFields };
      }
    );

    res.json(payload);
  } catch (error: any) {
    logger.error('Error fetching custom fields:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch custom fields' });
  }
});

// Create a new custom field
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { tableName, fieldName, displayName, groupName, dataType, isRequired, description, customTableId } = req.body;
  const userId = req.user?.userId;

  try {
    // Validate inputs
    if (!tableName || !fieldName || !displayName || !dataType) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!AVAILABLE_TABLES.includes(tableName)) {
      return res.status(400).json({ success: false, message: 'Invalid table name' });
    }

    // Check for duplicate field name
    const [existing] = await pool.execute<CustomField[]>(
      'SELECT * FROM CustomFields WHERE TableName = ? AND FieldName = ? AND IsActive = 1',
      [tableName, fieldName]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Field name already exists for this table' });
    }

    // When linked to a custom table the stored value is always an int (the row ID)
    const resolvedDataType = customTableId ? 'int' : dataType;

    // Create the custom field record
    const dbFieldName = `U_${fieldName}`;
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO CustomFields (TableName, FieldName, DisplayName, GroupName, DataType, IsRequired, Description, CreatedBy, IsActive, CreatedAt, CustomTableId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)`,
      [tableName, fieldName, displayName, groupName?.trim() || null, resolvedDataType, isRequired ? 1 : 0, description || '', userId, customTableId || null]
    );

    // Now add the column to the actual table in the database
    try {
      const alterQuery = `ALTER TABLE ${tableName} ADD COLUMN ${dbFieldName} ${resolvedDataType} ${isRequired ? 'NOT NULL' : 'NULL'}`;
      await pool.execute(alterQuery);
    } catch (alterError: any) {
      // If column addition fails, delete the CustomFields record we just inserted
      await pool.execute('DELETE FROM CustomFields WHERE Id = ?', [result.insertId]);
      throw new Error(`Failed to add column to database: ${alterError.message}`);
    }

    await invalidateByEntity('customField', { orgId: 'all' });
    await invalidateByEntity('customField', { orgId: `table:${tableName}` });

    res.status(201).json({
      success: true,
      message: 'Custom field created successfully',
      fieldId: result.insertId,
      dbFieldName: dbFieldName
    });
  } catch (error: any) {
    logger.error('Error creating custom field:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create custom field' });
  }
});

// Update an existing custom field (metadata + optional custom table association)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = typeof req.params.id === 'string' ? parseInt(req.params.id, 10) : NaN;
  const { displayName, groupName, isRequired, description, customTableId } = req.body;

  try {
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid field ID' });
    }

    if (!displayName || !String(displayName).trim()) {
      return res.status(400).json({ success: false, message: 'Display name is required' });
    }

    const [existingRows] = await pool.execute<CustomField[]>(
      'SELECT * FROM CustomFields WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Custom field not found' });
    }

    const existing = existingRows[0];
    const normalizedCustomTableId = customTableId ? Number(customTableId) : null;

    if (normalizedCustomTableId !== null && Number.isNaN(normalizedCustomTableId)) {
      return res.status(400).json({ success: false, message: 'Invalid custom table ID' });
    }

    if (normalizedCustomTableId !== null) {
      const [tableRows] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM CustomTables WHERE Id = ?',
        [normalizedCustomTableId]
      );
      if (!tableRows || tableRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Selected custom table does not exist' });
      }
    }

    // Data type is immutable after field creation
    const resolvedDataType = String(existing.DataType || '').toLowerCase();

    // Linking to a custom table stores row IDs, so only int fields are eligible
    if (normalizedCustomTableId !== null && resolvedDataType !== 'int') {
      return res.status(400).json({
        success: false,
        message: 'Only int custom fields can be linked to a custom table. Create a new int field if needed.',
      });
    }
    const dbFieldName = `U_${existing.FieldName}`;

    await pool.execute(
      `UPDATE CustomFields
       SET DisplayName = ?, GroupName = ?, IsRequired = ?, Description = ?, CustomTableId = ?
       WHERE Id = ?`,
      [
        String(displayName).trim(),
        groupName?.trim() || null,
        isRequired ? 1 : 0,
        description || '',
        normalizedCustomTableId,
        id,
      ]
    );

    try {
      const nullability = isRequired ? 'NOT NULL' : 'NULL';
      const alterQuery = `ALTER TABLE ${existing.TableName} MODIFY COLUMN ${dbFieldName} ${existing.DataType} ${nullability}`;
      await pool.execute(alterQuery);
    } catch (alterError: any) {
      logger.warn('Could not alter physical column type/nullability for custom field update:', alterError?.message || alterError);
    }

    await invalidateByEntity('customField', { orgId: 'all' });
    await invalidateByEntity('customField', { orgId: `table:${existing.TableName}` });

    res.json({ success: true, message: 'Custom field updated successfully' });
  } catch (error: any) {
    logger.error('Error updating custom field:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update custom field' });
  }
});

// Delete (soft delete) a custom field
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = typeof req.params.id === 'string' ? parseInt(req.params.id, 10) : NaN;

  try {
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid field ID' });
    }

    // Get the field info first
    const [fields] = await pool.execute<CustomField[]>(
      'SELECT TableName, FieldName FROM CustomFields WHERE Id = ?',
      [id]
    );

    if (!fields || fields.length === 0) {
      return res.status(404).json({ success: false, message: 'Custom field not found' });
    }

    const fieldInfo = fields[0];
    const dbFieldName = `U_${fieldInfo.FieldName}`;

    // Soft delete the record
    await pool.execute(
      'UPDATE CustomFields SET IsActive = 0 WHERE Id = ?',
      [id]
    );

    // Optionally drop the column from the table (commented out for safety)
    try {
      const dropQuery = `ALTER TABLE ${fieldInfo.TableName} DROP COLUMN ${dbFieldName}`;
      await pool.execute(dropQuery);
    } catch (dropError: any) {
      logger.warn(`Could not drop column ${dbFieldName} from ${fieldInfo.TableName}:`, dropError);
      // Don't fail the delete if column drop fails
    }

    await invalidateByEntity('customField', { orgId: 'all' });
    await invalidateByEntity('customField', { orgId: `table:${fieldInfo.TableName}` });

    res.json({ success: true, message: 'Custom field deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting custom field:', error);
    res.status(500).json({ success: false, message: 'Failed to delete custom field' });
  }
});

// Get available tables for custom fields
router.get('/meta/available-tables', authenticateToken, async (req: AuthRequest, res: Response) => {
  res.json({ success: true, tables: AVAILABLE_TABLES });
});

export default router;
