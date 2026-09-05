'use client';

import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';

interface CustomTable {
  Id: number;
  Name: string;
  Description: string | null;
  ColumnCount: number;
  RowCount: number;
}

interface CustomTableColumn {
  Id: number;
  CustomTableId: number;
  ColumnName: string;
  DataType: string;
  IsRequired: number;
  SortOrder: number;
}

interface CustomTableRow {
  Id: number;
  CustomTableId: number;
  Description: string;
  cells: Record<number, string | null>;
}

const COLUMN_DATA_TYPES = [
  'varchar(50)',
  'varchar(100)',
  'varchar(255)',
  'int',
  'decimal(10,2)',
  'date',
  'text',
  'tinyint(1)',
];

export default function CustomTablesManagement() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [tables, setTables] = useState<CustomTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [columns, setColumns] = useState<CustomTableColumn[]>([]);
  const [rows, setRows] = useState<CustomTableRow[]>([]);
  const [modal, setModal] = useState<{
    type: 'confirm';
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModal({ type: 'confirm', title, message, onConfirm });
  };
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState('');

  // New table form
  const [showNewTableForm, setShowNewTableForm] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableDesc, setNewTableDesc] = useState('');
  const [isSavingTable, setIsSavingTable] = useState(false);

  // Edit table meta
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // Add column form
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('varchar(255)');
  const [newColRequired, setNewColRequired] = useState(false);
  const [isSavingColumn, setIsSavingColumn] = useState(false);

  // Row editing: rowId -> draft values
  const [editingRowId, setEditingRowId] = useState<number | 'new' | null>(null);
  const [rowDraft, setRowDraft] = useState<{ description: string; cells: Record<number, string> }>({
    description: '',
    cells: {},
  });
  const [isSavingRow, setIsSavingRow] = useState(false);

  const selectedTable = tables.find((t) => t.Id === selectedTableId) ?? null;

  // ── Load tables list ──────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/custom-tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
      }
    } catch {
      setError('Failed to load custom tables');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadTables(); }, [loadTables]);

  // ── Load detail when table selected ──────────────────────────────────────
  const loadDetail = useCallback(async (id: number) => {
    if (!token) return;
    setIsLoadingDetail(true);
    setEditingRowId(null);
    try {
      const [colRes, rowRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/custom-tables/${id}/columns`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/custom-tables/${id}/rows`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (colRes.ok) {
        const d = await colRes.json();
        setColumns(d.columns || []);
      }
      if (rowRes.ok) {
        const d = await rowRes.json();
        setRows(d.rows || []);
      }
    } catch {
      setError('Failed to load table details');
    } finally {
      setIsLoadingDetail(false);
    }
  }, [token]);

  const handleSelectTable = (id: number) => {
    const t = tables.find((t) => t.Id === id);
    setSelectedTableId(id);
    setMetaName(t?.Name ?? '');
    setMetaDesc(t?.Description ?? '');
    setEditingMeta(false);
    setShowAddColumn(false);
    setEditingRowId(null);
    void loadDetail(id);
  };

  // ── Create table ──────────────────────────────────────────────────────────
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    setIsSavingTable(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/custom-tables`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTableName.trim(), description: newTableDesc.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create table');
      showToast({ type: 'success', title: 'Table Created', message: `"${newTableName.trim()}" was created.` });
      setNewTableName('');
      setNewTableDesc('');
      setShowNewTableForm(false);
      await loadTables();
      if (data.tableId) handleSelectTable(data.tableId);
    } catch (err: any) {
      setError(err.message || 'Failed to create table');
    } finally {
      setIsSavingTable(false);
    }
  };

  // ── Update table meta ─────────────────────────────────────────────────────
  const handleSaveMeta = async () => {
    if (!selectedTableId || !metaName.trim()) return;
    setIsSavingMeta(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/custom-tables/${selectedTableId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: metaName.trim(), description: metaDesc.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed to update table');
      showToast({ type: 'success', title: 'Table Updated', message: 'Table updated successfully.' });
      setEditingMeta(false);
      await loadTables();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSavingMeta(false);
    }
  };

  // ── Delete table ──────────────────────────────────────────────────────────
  const handleDeleteTable = () => {
    if (!selectedTableId) return;
    const name = selectedTable?.Name ?? 'this table';
    showConfirm(
      'Delete table',
      `Delete "${name}" and all its data? This cannot be undone.`,
      () => void (async () => {
        try {
          const res = await fetch(`${getApiUrl()}/api/custom-tables/${selectedTableId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error('Failed to delete table');
          showToast({ type: 'success', title: 'Table Deleted', message: `"${name}" was deleted.` });
          setSelectedTableId(null);
          setColumns([]);
          setRows([]);
          await loadTables();
        } catch (err: any) {
          setError(err.message);
        }
      })()
    );
  };

  // ── Add column ────────────────────────────────────────────────────────────
  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTableId || !newColName.trim()) return;
    setIsSavingColumn(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/custom-tables/${selectedTableId}/columns`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnName: newColName.trim(),
          dataType: newColType,
          isRequired: newColRequired,
          sortOrder: columns.length,
        }),
      });
      if (!res.ok) throw new Error('Failed to add column');
      showToast({ type: 'success', title: 'Column Added', message: `"${newColName.trim()}" added.` });
      setNewColName('');
      setNewColType('varchar(255)');
      setNewColRequired(false);
      setShowAddColumn(false);
      await loadDetail(selectedTableId);
      await loadTables();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSavingColumn(false);
    }
  };

  // ── Delete column ─────────────────────────────────────────────────────────
  const handleDeleteColumn = (col: CustomTableColumn) => {
    if (!selectedTableId) return;
    showConfirm(
      'Delete column',
      `Delete column "${col.ColumnName}"? All values in this column will be lost.`,
      () => void (async () => {
        try {
          await fetch(`${getApiUrl()}/api/custom-tables/${selectedTableId}/columns/${col.Id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          showToast({ type: 'success', title: 'Column Deleted', message: `"${col.ColumnName}" deleted.` });
          await loadDetail(selectedTableId);
          await loadTables();
        } catch {
          setError('Failed to delete column');
        }
      })()
    );
  };

  // ── Row editing helpers ───────────────────────────────────────────────────
  const startNewRow = () => {
    setEditingRowId('new');
    setRowDraft({ description: '', cells: {} });
  };

  const startEditRow = (row: CustomTableRow) => {
    const cells: Record<number, string> = {};
    columns.forEach((col) => {
      cells[col.Id] = row.cells[col.Id] ?? '';
    });
    setEditingRowId(row.Id);
    setRowDraft({ description: row.Description, cells });
  };

  const cancelEditRow = () => {
    setEditingRowId(null);
    setRowDraft({ description: '', cells: {} });
  };

  const handleSaveRow = async () => {
    if (!selectedTableId || !rowDraft.description.trim()) return;
    setIsSavingRow(true);
    try {
      const cells: Record<string, string | null> = {};
      columns.forEach((col) => {
        cells[col.Id] = rowDraft.cells[col.Id]?.trim() || null;
      });

      let res: Response;
      if (editingRowId === 'new') {
        res = await fetch(`${getApiUrl()}/api/custom-tables/${selectedTableId}/rows`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: rowDraft.description.trim(), cells }),
        });
      } else {
        res = await fetch(`${getApiUrl()}/api/custom-tables/${selectedTableId}/rows/${editingRowId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: rowDraft.description.trim(), cells }),
        });
      }
      if (!res.ok) {
        let message = 'Failed to save row';
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {
          // ignore JSON parse failure
        }
        throw new Error(message);
      }
      setEditingRowId(null);
      await loadDetail(selectedTableId);
      await loadTables();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSavingRow(false);
    }
  };

  const handleDeleteRow = (row: CustomTableRow) => {
    if (!selectedTableId) return;
    showConfirm(
      'Delete row',
      `Delete row "${row.Description}"?`,
      () => void (async () => {
        try {
          await fetch(`${getApiUrl()}/api/custom-tables/${selectedTableId}/rows/${row.Id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          await loadDetail(selectedTableId);
          await loadTables();
        } catch {
          setError('Failed to delete row');
        }
      })()
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="text-gray-600 dark:text-gray-400">
          Create custom lookup tables with rows and extra columns. Link them to custom fields to get a searchable dropdown.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline text-sm">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Sidebar ── */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Tables</h3>
              <button
                onClick={() => setShowNewTableForm(!showNewTableForm)}
                className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                + New
              </button>
            </div>

            {showNewTableForm && (
              <form onSubmit={handleCreateTable} className="mb-4 space-y-2">
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Table name *"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={newTableDesc}
                  onChange={(e) => setNewTableDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowNewTableForm(false); setNewTableName(''); setNewTableDesc(''); }}
                    className="flex-1 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTable || !newTableName.trim()}
                    className="flex-1 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {isLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
            ) : tables.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">No custom tables yet.</div>
            ) : (
              <div className="space-y-1">
                {tables.map((table) => (
                  <button
                    key={table.Id}
                    onClick={() => handleSelectTable(table.Id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                      selectedTableId === table.Id
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium truncate">{table.Name}</span>
                      <span className={`text-xs ml-1 shrink-0 ${selectedTableId === table.Id ? 'text-blue-200' : 'text-gray-400'}`}>
                        {table.RowCount} rows
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Detail panel ── */}
        <div className="lg:col-span-3">
          {!selectedTable ? (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 p-16 text-center">
              <p className="text-gray-500 dark:text-gray-400">Select a table from the list or create a new one.</p>
            </div>
          ) : isLoadingDetail ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading...</div>
          ) : (
            <div className="space-y-6">
              {/* ── Meta header ── */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
                {editingMeta ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                      <input
                        type="text"
                        value={metaName}
                        onChange={(e) => setMetaName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                      <input
                        type="text"
                        value={metaDesc}
                        onChange={(e) => setMetaDesc(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingMeta(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">Cancel</button>
                      <button onClick={handleSaveMeta} disabled={isSavingMeta || !metaName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm">
                        {isSavingMeta ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedTable.Name}</h3>
                      {selectedTable.Description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedTable.Description}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                        {selectedTable.ColumnCount} extra column{selectedTable.ColumnCount !== 1 ? 's' : ''} · {selectedTable.RowCount} row{selectedTable.RowCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setMetaName(selectedTable.Name); setMetaDesc(selectedTable.Description ?? ''); setEditingMeta(true); }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
                        title="Edit table"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button
                        onClick={handleDeleteTable}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                        title="Delete table"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" /></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Columns section ── */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">Columns</h4>
                  <button
                    onClick={() => setShowAddColumn(!showAddColumn)}
                    className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    + Add Column
                  </button>
                </div>

                {/* Fixed columns */}
                <div className="mb-4 space-y-2">
                  {[{ name: 'Id', type: 'int (auto)' }, { name: 'Description', type: 'varchar(500)' }].map((c) => (
                    <div key={c.name} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{c.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{c.type}</span>
                      </div>
                      <span className="text-xs text-gray-400 italic">Default</span>
                    </div>
                  ))}

                  {columns.map((col) => (
                    <div key={col.Id} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{col.ColumnName}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{col.DataType}</span>
                        {col.IsRequired === 1 && (
                          <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded">Required</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteColumn(col)}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                        title="Delete column"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" /></svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add column inline form */}
                {showAddColumn && (
                  <form onSubmit={handleAddColumn} className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Column Name *</label>
                        <input
                          type="text"
                          value={newColName}
                          onChange={(e) => setNewColName(e.target.value)}
                          placeholder="e.g. Code"
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Data Type</label>
                        <select
                          value={newColType}
                          onChange={(e) => setNewColType(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        >
                          {COLUMN_DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer pb-2">
                          <input
                            type="checkbox"
                            checked={newColRequired}
                            onChange={(e) => setNewColRequired(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Required</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowAddColumn(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">Cancel</button>
                      <button type="submit" disabled={isSavingColumn || !newColName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm">
                        {isSavingColumn ? 'Adding...' : 'Add Column'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* ── Rows grid ── */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    Rows <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">({rows.length})</span>
                  </h4>
                  {editingRowId !== 'new' && (
                    <button
                      onClick={startNewRow}
                      className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      + Add Row
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description *</th>
                        {columns.map((col) => (
                          <th key={col.Id} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {col.ColumnName}
                            {col.IsRequired === 1 && <span className="text-red-500 ml-1">*</span>}
                          </th>
                        ))}
                        <th className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {/* New row form */}
                      {editingRowId === 'new' && (
                        <tr className="bg-blue-50 dark:bg-blue-900/10">
                          <td className="px-4 py-3 text-gray-400 text-xs">new</td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={rowDraft.description}
                              onChange={(e) => setRowDraft((d) => ({ ...d, description: e.target.value }))}
                              autoFocus
                              placeholder="Description"
                              className="w-full px-2 py-1.5 border border-blue-400 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </td>
                          {columns.map((col) => (
                            <td key={col.Id} className="px-4 py-3">
                              {col.DataType === 'tinyint(1)' ? (
                                <select
                                  value={rowDraft.cells[col.Id] ?? ''}
                                  onChange={(e) => setRowDraft((d) => ({ ...d, cells: { ...d.cells, [col.Id]: e.target.value } }))}
                                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                                >
                                  <option value="">—</option>
                                  <option value="1">Yes</option>
                                  <option value="0">No</option>
                                </select>
                              ) : (
                                <input
                                  type={col.DataType === 'date' ? 'date' : col.DataType === 'int' || col.DataType.startsWith('decimal(') ? 'number' : 'text'}
                                  value={rowDraft.cells[col.Id] ?? ''}
                                  onChange={(e) => setRowDraft((d) => ({ ...d, cells: { ...d.cells, [col.Id]: e.target.value } }))}
                                  className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={cancelEditRow} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Cancel">✕</button>
                              <button onClick={handleSaveRow} disabled={isSavingRow || !rowDraft.description.trim()} className="p-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 rounded transition-colors" title="Save">
                                {isSavingRow ? '...' : '✓'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}

                      {rows.length === 0 && editingRowId !== 'new' ? (
                        <tr>
                          <td colSpan={3 + columns.length} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                            No rows yet. Click "+ Add Row" to add the first entry.
                          </td>
                        </tr>
                      ) : (
                        rows.map((row) => (
                          editingRowId === row.Id ? (
                            <tr key={row.Id} className="bg-blue-50 dark:bg-blue-900/10">
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{row.Id}</td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={rowDraft.description}
                                  onChange={(e) => setRowDraft((d) => ({ ...d, description: e.target.value }))}
                                  autoFocus
                                  className="w-full px-2 py-1.5 border border-blue-400 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                              </td>
                              {columns.map((col) => (
                                <td key={col.Id} className="px-4 py-3">
                                  {col.DataType === 'tinyint(1)' ? (
                                    <select
                                      value={rowDraft.cells[col.Id] ?? ''}
                                      onChange={(e) => setRowDraft((d) => ({ ...d, cells: { ...d.cells, [col.Id]: e.target.value } }))}
                                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                      <option value="">—</option>
                                      <option value="1">Yes</option>
                                      <option value="0">No</option>
                                    </select>
                                  ) : (
                                    <input
                                      type={col.DataType === 'date' ? 'date' : col.DataType === 'int' || col.DataType.startsWith('decimal(') ? 'number' : 'text'}
                                      value={rowDraft.cells[col.Id] ?? ''}
                                      onChange={(e) => setRowDraft((d) => ({ ...d, cells: { ...d.cells, [col.Id]: e.target.value } }))}
                                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                  )}
                                </td>
                              ))}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <button onClick={cancelEditRow} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Cancel">✕</button>
                                  <button onClick={handleSaveRow} disabled={isSavingRow || !rowDraft.description.trim()} className="p-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 rounded transition-colors" title="Save">
                                    {isSavingRow ? '...' : '✓'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={row.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{row.Id}</td>
                              <td className="px-4 py-3 text-gray-900 dark:text-white">{row.Description}</td>
                              {columns.map((col) => (
                                <td key={col.Id} className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                  {row.cells[col.Id] ?? <span className="text-gray-400">—</span>}
                                </td>
                              ))}
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => startEditRow(row)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
                                    title="Edit row"
                                    aria-label="Edit row"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRow(row)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                                    title="Delete row"
                                    aria-label="Delete row"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" /></svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmAlertModal
        isOpen={!!modal}
        type="confirm"
        title={modal?.title || ''}
        message={modal?.message || ''}
        onClose={() => setModal(null)}
        onConfirm={() => {
          modal?.onConfirm();
          setModal(null);
        }}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </div>
  );
}
