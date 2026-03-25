import { Router, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Custom field interface
interface CustomField extends RowDataPacket {
  Id: number;
  TableName: string;
  FieldName: string;
  DisplayName: string;
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
    const [customFields] = await pool.execute<CustomField[]>(
      'SELECT * FROM CustomFields WHERE IsActive = 1 ORDER BY TableName, FieldName'
    );
    
    res.json({ success: true, customFields });
  } catch (error: any) {
    console.error('Error fetching custom fields:', error);
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

    const [customFields] = await pool.execute<CustomField[]>(
      'SELECT * FROM CustomFields WHERE TableName = ? AND IsActive = 1 ORDER BY FieldName',
      [tableName]
    );

    res.json({ success: true, customFields });
  } catch (error: any) {
    console.error('Error fetching custom fields:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch custom fields' });
  }
});

// Create a new custom field
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { tableName, fieldName, displayName, dataType, isRequired, description } = req.body;
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

    // Create the custom field record
    const dbFieldName = `U_${fieldName}`;
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO CustomFields (TableName, FieldName, DisplayName, DataType, IsRequired, Description, CreatedBy, IsActive, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [tableName, fieldName, displayName, dataType, isRequired ? 1 : 0, description || '', userId]
    );

    // Now add the column to the actual table in the database
    try {
      const alterQuery = `ALTER TABLE ${tableName} ADD COLUMN ${dbFieldName} ${dataType} ${isRequired ? 'NOT NULL' : 'NULL'}`;
      await pool.execute(alterQuery);
    } catch (alterError: any) {
      // If column addition fails, delete the CustomFields record we just inserted
      await pool.execute('DELETE FROM CustomFields WHERE Id = ?', [result.insertId]);
      throw new Error(`Failed to add column to database: ${alterError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Custom field created successfully',
      fieldId: result.insertId,
      dbFieldName: dbFieldName
    });
  } catch (error: any) {
    console.error('Error creating custom field:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create custom field' });
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
      console.warn(`Could not drop column ${dbFieldName} from ${fieldInfo.TableName}:`, dropError);
      // Don't fail the delete if column drop fails
    }

    res.json({ success: true, message: 'Custom field deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting custom field:', error);
    res.status(500).json({ success: false, message: 'Failed to delete custom field' });
  }
});

// Get available tables for custom fields
router.get('/meta/available-tables', authenticateToken, async (req: AuthRequest, res: Response) => {
  res.json({ success: true, tables: AVAILABLE_TABLES });
});

export default router;
