import { Router, Response } from 'express';
import { pool, RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

interface CustomTableColumnRow extends RowDataPacket {
  Id: number;
  CustomTableId: number;
  ColumnName: string;
  DataType: string;
  IsRequired: number;
}

const normalizeDateValue = (raw: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0] || null;
};

const normalizeByDataType = (dataType: string, value: unknown): { value: string | null; error?: string } => {
  if (value === null || value === undefined) return { value: null };
  const raw = String(value).trim();
  if (!raw) return { value: null };

  const normalizedType = String(dataType || '').toLowerCase();

  if (normalizedType === 'int') {
    if (!/^-?\d+$/.test(raw)) return { value: null, error: 'must be an integer' };
    return { value: String(parseInt(raw, 10)) };
  }

  if (normalizedType.startsWith('decimal(')) {
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return { value: null, error: 'must be a decimal number' };
    return { value: String(Number(raw)) };
  }

  if (normalizedType === 'tinyint(1)') {
    const truthy = ['1', 'true', 'yes', 'on'];
    const falsy = ['0', 'false', 'no', 'off'];
    const lower = raw.toLowerCase();
    if (truthy.includes(lower)) return { value: '1' };
    if (falsy.includes(lower)) return { value: '0' };
    return { value: null, error: 'must be a boolean (0/1, true/false)' };
  }

  if (normalizedType === 'date') {
    const normalizedDate = normalizeDateValue(raw);
    if (!normalizedDate) return { value: null, error: 'must be a valid date (YYYY-MM-DD)' };
    return { value: normalizedDate };
  }

  return { value: raw };
};

const toColumnValueMap = (rows: RowDataPacket[]): Record<number, string | null> => {
  const map: Record<number, string | null> = {};
  rows.forEach((r: any) => {
    map[Number(r.ColumnId)] = r.Value === null || r.Value === undefined ? null : String(r.Value);
  });
  return map;
};

// ── GET /api/custom-tables ── list all tables with counts
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const [tables] = await pool.execute<RowDataPacket[]>(
      `SELECT ct.Id, ct.Name, ct.Description, ct.CreatedAt,
              (SELECT COUNT(*) FROM CustomTableColumns WHERE CustomTableId = ct.Id) AS ColumnCount,
              (SELECT COUNT(*) FROM CustomTableRows WHERE CustomTableId = ct.Id) AS RowCount
       FROM CustomTables ct
       ORDER BY ct.Name`
    );
    res.json({ success: true, tables });
  } catch (err: any) {
    logger.error('Error fetching custom tables:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch custom tables' });
  }
});

// ── POST /api/custom-tables ── create table
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;
  const userId = req.user?.userId;

  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: 'Table name is required' });
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO CustomTables (Name, Description, CreatedBy, CreatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [name.trim(), description?.trim() || null, userId]
    );
    res.status(201).json({ success: true, tableId: result.insertId });
  } catch (err: any) {
    logger.error('Error creating custom table:', err);
    res.status(500).json({ success: false, message: 'Failed to create custom table' });
  }
});

// ── PUT /api/custom-tables/:id ── update table meta
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const { name, description } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: 'Table name is required' });
  }

  try {
    await pool.execute(
      'UPDATE CustomTables SET Name = ?, Description = ? WHERE Id = ?',
      [name.trim(), description?.trim() || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    logger.error('Error updating custom table:', err);
    res.status(500).json({ success: false, message: 'Failed to update custom table' });
  }
});

// ── DELETE /api/custom-tables/:id ── delete table and all its data
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);

  try {
    // Delete cell values for rows belonging to this table
    await pool.execute(
      'DELETE cv FROM CustomTableCellValues cv INNER JOIN CustomTableRows r ON cv.RowId = r.Id WHERE r.CustomTableId = ?',
      [id]
    );
    await pool.execute('DELETE FROM CustomTableRows WHERE CustomTableId = ?', [id]);
    await pool.execute('DELETE FROM CustomTableColumns WHERE CustomTableId = ?', [id]);
    await pool.execute('DELETE FROM CustomTables WHERE Id = ?', [id]);
    // Unlink any custom fields that referenced this table
    await pool.execute('UPDATE CustomFields SET CustomTableId = NULL WHERE CustomTableId = ?', [id]);

    res.json({ success: true });
  } catch (err: any) {
    logger.error('Error deleting custom table:', err);
    res.status(500).json({ success: false, message: 'Failed to delete custom table' });
  }
});

// ── GET /api/custom-tables/:id/columns ── get columns for a table
router.get('/:id/columns', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);

  try {
    const [columns] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM CustomTableColumns WHERE CustomTableId = ? ORDER BY SortOrder, Id',
      [id]
    );
    res.json({ success: true, columns });
  } catch (err: any) {
    logger.error('Error fetching columns:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch columns' });
  }
});

// ── POST /api/custom-tables/:id/columns ── add column
router.post('/:id/columns', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const { columnName, dataType, isRequired, sortOrder } = req.body;

  if (!columnName?.trim()) {
    return res.status(400).json({ success: false, message: 'Column name is required' });
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO CustomTableColumns (CustomTableId, ColumnName, DataType, IsRequired, SortOrder) VALUES (?, ?, ?, ?, ?)',
      [id, columnName.trim(), dataType || 'varchar(255)', isRequired ? 1 : 0, sortOrder ?? 0]
    );
    res.status(201).json({ success: true, columnId: result.insertId });
  } catch (err: any) {
    logger.error('Error adding column:', err);
    res.status(500).json({ success: false, message: 'Failed to add column' });
  }
});

// ── DELETE /api/custom-tables/:id/columns/:colId ── delete column
router.delete('/:id/columns/:colId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const colId = parseInt(req.params.colId as string, 10);

  try {
    await pool.execute('DELETE FROM CustomTableCellValues WHERE ColumnId = ?', [colId]);
    await pool.execute('DELETE FROM CustomTableColumns WHERE Id = ?', [colId]);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('Error deleting column:', err);
    res.status(500).json({ success: false, message: 'Failed to delete column' });
  }
});

// ── GET /api/custom-tables/:id/rows ── get rows with cell values
router.get('/:id/rows', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM CustomTableRows WHERE CustomTableId = ? ORDER BY Id',
      [id]
    );

    const [cellValues] = await pool.execute<RowDataPacket[]>(
      `SELECT cv.* FROM CustomTableCellValues cv
       INNER JOIN CustomTableRows r ON cv.RowId = r.Id
       WHERE r.CustomTableId = ?`,
      [id]
    );

    const rowsWithCells = (rows as any[]).map((row: any) => {
      const cells: Record<number, string | null> = {};
      (cellValues as any[])
        .filter((cv: any) => cv.RowId === row.Id)
        .forEach((cv: any) => { cells[cv.ColumnId] = cv.Value; });
      return { ...row, cells };
    });

    res.json({ success: true, rows: rowsWithCells });
  } catch (err: any) {
    logger.error('Error fetching rows:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch rows' });
  }
});

// ── POST /api/custom-tables/:id/rows ── create row
router.post('/:id/rows', authenticateToken, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const { description, cells } = req.body; // cells: { [columnId: string]: value }

  if (!description?.trim()) {
    return res.status(400).json({ success: false, message: 'Description is required' });
  }

  try {
    const [columnRows] = await pool.execute<CustomTableColumnRow[]>(
      'SELECT Id, CustomTableId, ColumnName, DataType, IsRequired FROM CustomTableColumns WHERE CustomTableId = ?',
      [id]
    );
    const columns = columnRows || [];
    const colById = new Map<number, CustomTableColumnRow>(columns.map((col) => [Number(col.Id), col]));

    const normalizedCells: Record<number, string | null> = {};
    if (cells && typeof cells === 'object') {
      for (const [columnIdRaw, value] of Object.entries(cells as Record<string, unknown>)) {
        const colId = parseInt(columnIdRaw, 10);
        const col = colById.get(colId);
        if (!col) {
          return res.status(400).json({ success: false, message: `Unknown column ID: ${columnIdRaw}` });
        }
        const normalized = normalizeByDataType(col.DataType, value);
        if (normalized.error) {
          return res.status(400).json({ success: false, message: `Invalid value for ${col.ColumnName}: ${normalized.error}` });
        }
        normalizedCells[colId] = normalized.value;
      }
    }

    const missingRequired = columns.find((col) => Number(col.IsRequired) === 1 && !normalizedCells[Number(col.Id)]);
    if (missingRequired) {
      return res.status(400).json({ success: false, message: `Column ${missingRequired.ColumnName} is required` });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO CustomTableRows (CustomTableId, Description) VALUES (?, ?)',
      [id, description.trim()]
    );
    const rowId = result.insertId;

    for (const [columnId, strValue] of Object.entries(normalizedCells)) {
      if (strValue !== null && strValue !== '') {
        await pool.execute(
          'INSERT INTO CustomTableCellValues (RowId, ColumnId, Value) VALUES (?, ?, ?)',
          [rowId, parseInt(columnId, 10), strValue]
        );
      }
    }

    res.status(201).json({ success: true, rowId });
  } catch (err: any) {
    logger.error('Error creating row:', err);
    res.status(500).json({ success: false, message: 'Failed to create row' });
  }
});

// ── PUT /api/custom-tables/:id/rows/:rowId ── update row
router.put('/:id/rows/:rowId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const tableId = parseInt(req.params.id as string, 10);
  const rowId = parseInt(req.params.rowId as string, 10);
  const { description, cells } = req.body;

  if (!description?.trim()) {
    return res.status(400).json({ success: false, message: 'Description is required' });
  }

  try {
    const [rowExists] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM CustomTableRows WHERE Id = ? AND CustomTableId = ?',
      [rowId, tableId]
    );
    if (!rowExists || rowExists.length === 0) {
      return res.status(404).json({ success: false, message: 'Row not found for this table' });
    }

    const [columnRows] = await pool.execute<CustomTableColumnRow[]>(
      'SELECT Id, CustomTableId, ColumnName, DataType, IsRequired FROM CustomTableColumns WHERE CustomTableId = ?',
      [tableId]
    );
    const columns = columnRows || [];
    const colById = new Map<number, CustomTableColumnRow>(columns.map((col) => [Number(col.Id), col]));

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT ColumnId, Value FROM CustomTableCellValues WHERE RowId = ?',
      [rowId]
    );
    const existingByColumnId = toColumnValueMap(existingRows);

    const normalizedCells: Record<number, string | null> = {};
    if (cells && typeof cells === 'object') {
      for (const [columnIdRaw, value] of Object.entries(cells as Record<string, unknown>)) {
        const colId = parseInt(columnIdRaw, 10);
        const col = colById.get(colId);
        if (!col) {
          return res.status(400).json({ success: false, message: `Unknown column ID: ${columnIdRaw}` });
        }
        const normalized = normalizeByDataType(col.DataType, value);
        if (normalized.error) {
          return res.status(400).json({ success: false, message: `Invalid value for ${col.ColumnName}: ${normalized.error}` });
        }
        normalizedCells[colId] = normalized.value;
      }
    }

    const missingRequired = columns.find((col) => {
      if (Number(col.IsRequired) !== 1) return false;
      const colId = Number(col.Id);
      const finalValue = Object.prototype.hasOwnProperty.call(normalizedCells, colId)
        ? normalizedCells[colId]
        : (existingByColumnId[colId] ?? null);
      return !finalValue;
    });
    if (missingRequired) {
      return res.status(400).json({ success: false, message: `Column ${missingRequired.ColumnName} is required` });
    }

    await pool.execute(
      'UPDATE CustomTableRows SET Description = ? WHERE Id = ? AND CustomTableId = ?',
      [description.trim(), rowId, tableId]
    );

    for (const [columnId, strValue] of Object.entries(normalizedCells)) {
      const colId = parseInt(columnId, 10);
      const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM CustomTableCellValues WHERE RowId = ? AND ColumnId = ?',
        [rowId, colId]
      );
      if ((existing as any[]).length > 0) {
        if (!strValue) {
          await pool.execute('DELETE FROM CustomTableCellValues WHERE RowId = ? AND ColumnId = ?', [rowId, colId]);
        } else {
          await pool.execute(
            'UPDATE CustomTableCellValues SET Value = ? WHERE RowId = ? AND ColumnId = ?',
            [strValue, rowId, colId]
          );
        }
      } else if (strValue) {
        await pool.execute(
          'INSERT INTO CustomTableCellValues (RowId, ColumnId, Value) VALUES (?, ?, ?)',
          [rowId, colId, strValue]
        );
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    logger.error('Error updating row:', err);
    res.status(500).json({ success: false, message: 'Failed to update row' });
  }
});

// ── DELETE /api/custom-tables/:id/rows/:rowId ── delete row
router.delete('/:id/rows/:rowId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const rowId = parseInt(req.params.rowId as string, 10);

  try {
    await pool.execute('DELETE FROM CustomTableCellValues WHERE RowId = ?', [rowId]);
    await pool.execute('DELETE FROM CustomTableRows WHERE Id = ?', [rowId]);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('Error deleting row:', err);
    res.status(500).json({ success: false, message: 'Failed to delete row' });
  }
});

export default router;
