import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

const normalizeDateKey = (value: unknown): string => String(value || '').split('T')[0];

/**
 * GET /api/allocation-snapshots/:id/data
 * Return headers + daily allocations for a snapshot (used for Gantt overlay)
 */
router.get('/:id/data', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const snapshotId = Number(req.params.id);
    if (Number.isNaN(snapshotId)) {
      return res.status(400).json({ success: false, message: 'Invalid snapshot ID' });
    }

    const [snapshotRows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Name FROM AllocationSnapshots WHERE Id = ?`,
      [snapshotId]
    );
    if (snapshotRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    const [headers] = await pool.execute<RowDataPacket[]>(
      `SELECT OriginalHeaderId, TaskId, UserId, AllocationMode, SplitOrder,
              PlannedHours, HoursPerDay, PlannedStartDate, PlannedEndDate
       FROM AllocationSnapshotHeaders WHERE SnapshotId = ?`,
      [snapshotId]
    );

    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT OriginalHeaderId, TaskId, UserId, AllocationDate, AllocatedHours
       FROM AllocationSnapshotAllocations WHERE SnapshotId = ?`,
      [snapshotId]
    );

    return res.json({
      success: true,
      snapshotName: snapshotRows[0].Name,
      headers,
      allocations,
    });
  } catch (error) {
    console.error('Error fetching snapshot data:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch snapshot data' });
  }
});

/**
 * GET /api/allocation-snapshots
 * List all allocation snapshots
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.Id, s.Name, s.Description, s.TotalHeaders, s.TotalAllocations, s.TotalChildAllocations, s.CreatedAt,
              u.FirstName, u.LastName, u.Username
       FROM AllocationSnapshots s
       LEFT JOIN Users u ON s.CreatedBy = u.Id
       ORDER BY s.CreatedAt DESC`
    );
    res.json({ success: true, snapshots: rows });
  } catch (error) {
    console.error('Error fetching allocation snapshots:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch snapshots' });
  }
});

/**
 * POST /api/allocation-snapshots
 * Create a new snapshot of all current allocations
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  let connection: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    const userId = req.user?.userId;
    const { name, description } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Snapshot name is required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Insert snapshot record
    const [snapshotResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO AllocationSnapshots (Name, Description, CreatedBy, TotalHeaders, TotalAllocations, TotalChildAllocations)
       VALUES (?, ?, ?, 0, 0, 0)`,
      [String(name).trim(), description ? String(description).trim() : null, userId || null]
    );
    const snapshotId = snapshotResult.insertId;

    // Read all current TaskAllocationHeaders
    const [headers] = await connection.execute<RowDataPacket[]>(
      `SELECT Id, TaskId, UserId, AllocationMode, SplitOrder, PlannedHours, HoursPerDay,
              PlannedStartDate, PlannedEndDate, CreatedBy
       FROM TaskAllocationHeaders`
    );

    // Read all current TaskAllocations
    const [allocations] = await connection.execute<RowDataPacket[]>(
      `SELECT Id, TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours,
              StartTime, EndTime, IsManual
       FROM TaskAllocations`
    );

    // Read all current TaskChildAllocations
    const [childAllocs] = await connection.execute<RowDataPacket[]>(
      `SELECT Id, ParentTaskId, TaskAllocationHeaderId, ChildTaskId, AllocationDate,
              AllocatedHours, Level, StartTime, EndTime
       FROM TaskChildAllocations`
    );

    // Insert snapshot headers
    for (const h of headers as RowDataPacket[]) {
      await connection.execute(
        `INSERT INTO AllocationSnapshotHeaders
         (SnapshotId, OriginalHeaderId, TaskId, UserId, AllocationMode, SplitOrder,
          PlannedHours, HoursPerDay, PlannedStartDate, PlannedEndDate, CreatedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshotId,
          h.Id,
          h.TaskId,
          h.UserId,
          h.AllocationMode,
          h.SplitOrder ?? null,
          h.PlannedHours ?? null,
          h.HoursPerDay ?? null,
          h.PlannedStartDate ? normalizeDateKey(h.PlannedStartDate) : null,
          h.PlannedEndDate ? normalizeDateKey(h.PlannedEndDate) : null,
          h.CreatedBy ?? null,
        ]
      );
    }

    // Insert snapshot allocations
    for (const a of allocations as RowDataPacket[]) {
      await connection.execute(
        `INSERT INTO AllocationSnapshotAllocations
         (SnapshotId, OriginalAllocationId, OriginalHeaderId, TaskId, UserId,
          AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshotId,
          a.Id,
          a.TaskAllocationHeaderId ?? null,
          a.TaskId,
          a.UserId,
          normalizeDateKey(a.AllocationDate),
          a.AllocatedHours,
          a.StartTime ?? null,
          a.EndTime ?? null,
          a.IsManual ?? 0,
        ]
      );
    }

    // Insert snapshot child allocations
    for (const c of childAllocs as RowDataPacket[]) {
      await connection.execute(
        `INSERT INTO AllocationSnapshotChildAllocations
         (SnapshotId, OriginalChildAllocId, OriginalHeaderId, ParentTaskId, ChildTaskId,
          AllocationDate, AllocatedHours, Level, StartTime, EndTime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshotId,
          c.Id,
          c.TaskAllocationHeaderId ?? null,
          c.ParentTaskId,
          c.ChildTaskId,
          normalizeDateKey(c.AllocationDate),
          c.AllocatedHours,
          c.Level,
          c.StartTime ?? null,
          c.EndTime ?? null,
        ]
      );
    }

    // Update counts
    await connection.execute(
      `UPDATE AllocationSnapshots
       SET TotalHeaders = ?, TotalAllocations = ?, TotalChildAllocations = ?
       WHERE Id = ?`,
      [
        (headers as RowDataPacket[]).length,
        (allocations as RowDataPacket[]).length,
        (childAllocs as RowDataPacket[]).length,
        snapshotId,
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Snapshot created successfully',
      snapshotId,
      totalHeaders: (headers as RowDataPacket[]).length,
      totalAllocations: (allocations as RowDataPacket[]).length,
      totalChildAllocations: (childAllocs as RowDataPacket[]).length,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error creating allocation snapshot:', error);
    res.status(500).json({ success: false, message: 'Failed to create snapshot' });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/allocation-snapshots/:id/restore
 * Restore all allocations from the given snapshot (replaces current allocations)
 */
router.post('/:id/restore', authenticateToken, async (req: AuthRequest, res: Response) => {
  let connection: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
  try {
    const snapshotId = Number(req.params.id);
    if (Number.isNaN(snapshotId)) {
      return res.status(400).json({ success: false, message: 'Invalid snapshot ID' });
    }

    // Verify snapshot exists (read outside transaction for quick check)
    const [snapshotRows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Name FROM AllocationSnapshots WHERE Id = ?`,
      [snapshotId]
    );
    if (snapshotRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Read snapshot data
    const [snapHeaders] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM AllocationSnapshotHeaders WHERE SnapshotId = ? ORDER BY Id ASC`,
      [snapshotId]
    );
    const [snapAllocations] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM AllocationSnapshotAllocations WHERE SnapshotId = ?`,
      [snapshotId]
    );
    const [snapChildAllocations] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM AllocationSnapshotChildAllocations WHERE SnapshotId = ?`,
      [snapshotId]
    );

    // Delete current allocations in dependency order
    await connection.execute(`DELETE FROM TaskChildAllocations`);
    await connection.execute(`DELETE FROM TaskAllocations`);
    await connection.execute(`DELETE FROM TaskAllocationHeaders`);

    // Restore headers and build old-ID → new-ID map
    const headerIdMap = new Map<number, number>();
    for (const h of snapHeaders as RowDataPacket[]) {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO TaskAllocationHeaders
         (TaskId, UserId, AllocationMode, SplitOrder, PlannedHours, HoursPerDay,
          PlannedStartDate, PlannedEndDate, CreatedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          h.TaskId,
          h.UserId,
          h.AllocationMode,
          h.SplitOrder ?? null,
          h.PlannedHours ?? null,
          h.HoursPerDay ?? null,
          h.PlannedStartDate ? normalizeDateKey(h.PlannedStartDate) : null,
          h.PlannedEndDate ? normalizeDateKey(h.PlannedEndDate) : null,
          h.CreatedBy ?? null,
        ]
      );
      headerIdMap.set(Number(h.OriginalHeaderId), Number(result.insertId));
    }

    // Restore allocations with remapped header IDs
    for (const a of snapAllocations as RowDataPacket[]) {
      const newHeaderId = a.OriginalHeaderId
        ? (headerIdMap.get(Number(a.OriginalHeaderId)) ?? null)
        : null;
      await connection.execute(
        `INSERT INTO TaskAllocations
         (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours,
          StartTime, EndTime, IsManual)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.TaskId,
          newHeaderId,
          a.UserId,
          normalizeDateKey(a.AllocationDate),
          a.AllocatedHours,
          a.StartTime ?? null,
          a.EndTime ?? null,
          a.IsManual ?? 0,
        ]
      );
    }

    // Restore child allocations with remapped header IDs
    for (const c of snapChildAllocations as RowDataPacket[]) {
      const newHeaderId = c.OriginalHeaderId
        ? (headerIdMap.get(Number(c.OriginalHeaderId)) ?? null)
        : null;
      await connection.execute(
        `INSERT INTO TaskChildAllocations
         (ParentTaskId, TaskAllocationHeaderId, ChildTaskId, AllocationDate,
          AllocatedHours, Level, StartTime, EndTime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.ParentTaskId,
          newHeaderId,
          c.ChildTaskId,
          normalizeDateKey(c.AllocationDate),
          c.AllocatedHours,
          c.Level,
          c.StartTime ?? null,
          c.EndTime ?? null,
        ]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: `Snapshot "${snapshotRows[0].Name}" restored successfully`,
      restoredHeaders: (snapHeaders as RowDataPacket[]).length,
      restoredAllocations: (snapAllocations as RowDataPacket[]).length,
      restoredChildAllocations: (snapChildAllocations as RowDataPacket[]).length,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error restoring allocation snapshot:', error);
    res.status(500).json({ success: false, message: 'Failed to restore snapshot' });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * DELETE /api/allocation-snapshots/:id
 * Delete a snapshot and all its data
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const snapshotId = Number(req.params.id);
    if (Number.isNaN(snapshotId)) {
      return res.status(400).json({ success: false, message: 'Invalid snapshot ID' });
    }

    const [snapshotRows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM AllocationSnapshots WHERE Id = ?`,
      [snapshotId]
    );
    if (snapshotRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Snapshot not found' });
    }

    await pool.execute(`DELETE FROM AllocationSnapshotChildAllocations WHERE SnapshotId = ?`, [snapshotId]);
    await pool.execute(`DELETE FROM AllocationSnapshotAllocations WHERE SnapshotId = ?`, [snapshotId]);
    await pool.execute(`DELETE FROM AllocationSnapshotHeaders WHERE SnapshotId = ?`, [snapshotId]);
    await pool.execute(`DELETE FROM AllocationSnapshots WHERE Id = ?`, [snapshotId]);

    res.json({ success: true, message: 'Snapshot deleted successfully' });
  } catch (error) {
    console.error('Error deleting allocation snapshot:', error);
    res.status(500).json({ success: false, message: 'Failed to delete snapshot' });
  }
});

export default router;
