'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface CustomTable {
  Id: number;
  Name: string;
  Description: string | null;
}

interface CustomField {
  Id: number;
  TableName: string;
  FieldName: string;
  DisplayName: string;
  GroupName: string | null;
  DataType: string;
  IsRequired: number;
  Description: string;
  CreatedAt: string;
  CreatedBy: number;
  IsActive: number;
  CustomTableId: number | null;
}

interface FormData {
  tableName: string;
  fieldName: string;
  displayName: string;
  groupName: string;
  dataType: string;
  isRequired: boolean;
  description: string;
  customTableId: number | null;
}

const AVAILABLE_DATA_TYPES = [
  'varchar(50)',
  'varchar(100)',
  'varchar(255)',
  'int',
  'decimal(10,2)',
  'decimal(19,4)',
  'date',
  'text',
  'tinyint(1)',
];

const AVAILABLE_TABLES = [
  'Users',
  'Projects',
  'Tasks',
  'Organizations',
  'Customers',
  'Tickets',
  'TimeEntries',
  'CallRecords',
];

export default function CustomFieldsManagement() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customTables, setCustomTables] = useState<CustomTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('Projects');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    tableName: 'Projects',
    fieldName: '',
    displayName: '',
    groupName: '',
    dataType: 'varchar(255)',
    isRequired: false,
    description: '',
    customTableId: null,
  });

  useEffect(() => {
    void loadCustomFields();
    void loadCustomTables();
  }, [token]);

  const loadCustomTables = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/custom-tables`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCustomTables(data.tables || []);
      }
    } catch {
      // non-critical – ignore
    }
  };

  const loadCustomFields = async () => {
    if (!token) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${getApiUrl()}/api/custom-fields`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setCustomFields(data.customFields || []);
      } else {
        throw new Error('Failed to load custom fields');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load custom fields');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFields = customFields.filter(field => field.TableName === selectedTable);
  const existingGroupNames = Array.from(new Set(
    filteredFields
      .map((field) => (field.GroupName || '').trim())
      .filter((name) => name.length > 0)
  )).sort((a, b) => a.localeCompare(b));

  const resetForm = () => {
    setEditingFieldId(null);
    setFormData({
      tableName: selectedTable,
      fieldName: '',
      displayName: '',
      groupName: '',
      dataType: 'varchar(255)',
      isRequired: false,
      description: '',
      customTableId: null,
    });
  };

  const handleEditField = (field: CustomField) => {
    setEditingFieldId(field.Id);
    setShowForm(true);
    setFormData({
      tableName: field.TableName,
      fieldName: field.FieldName,
      displayName: field.DisplayName,
      groupName: field.GroupName || '',
      dataType: field.DataType,
      isRequired: field.IsRequired === 1,
      description: field.Description || '',
      customTableId: field.CustomTableId || null,
    });
  };

  const handleSubmitField = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.fieldName.trim()) {
      setError('Field name is required');
      return;
    }

    if (!formData.displayName.trim()) {
      setError('Display name is required');
      return;
    }

    // Check for duplicate field name in the same table
    const isDuplicate = filteredFields.some(
      field => field.FieldName.toLowerCase() === formData.fieldName.toLowerCase() && field.Id !== editingFieldId
    );

    if (isDuplicate) {
      setError(`A custom field with the name "${formData.fieldName}" already exists for this table`);
      return;
    }

    setIsSubmitting(true);

    try {
      const isEditing = editingFieldId !== null;
      const response = await fetch(`${getApiUrl()}/api/custom-fields${isEditing ? `/${editingFieldId}` : ''}`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tableName: formData.tableName,
          fieldName: formData.fieldName,
          displayName: formData.displayName,
          groupName: formData.groupName,
          dataType: formData.dataType,
          isRequired: formData.isRequired,
          description: formData.description,
          customTableId: formData.customTableId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || (isEditing ? 'Failed to update custom field' : 'Failed to create custom field'));
      }

      setSuccess(isEditing ? 'Custom field updated successfully' : 'Custom field created successfully');
      showToast({ type: 'success', title: 'Custom Field', message: isEditing ? 'Custom field updated successfully' : 'Custom field created successfully' });
      await loadCustomFields();
      setShowForm(false);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save custom field');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteField = async (fieldId: number, fieldName: string) => {
    if (!window.confirm(`Are you sure you want to delete the custom field "${fieldName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/custom-fields/${fieldId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete custom field');
      }

      setSuccess('Custom field deleted successfully');
      showToast({ type: 'success', title: 'Custom Field', message: 'Custom field deleted successfully' });
      await loadCustomFields();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete custom field');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="text-gray-600 dark:text-gray-400">Loading custom fields...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Custom Fields Management
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Add custom fields to master data tables. Field names will be automatically prefixed with U_ in the database.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Table Selection */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 sticky top-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Tables</h3>
            <div className="space-y-2">
              {AVAILABLE_TABLES.map((table) => {
                const tableFieldCount = customFields.filter(f => f.TableName === table).length;
                return (
                  <button
                    key={table}
                    onClick={() => setSelectedTable(table)}
                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex justify-between items-center ${
                      selectedTable === table
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span>{table}</span>
                    {tableFieldCount > 0 && (
                      <span className="text-xs bg-gray-300 dark:bg-gray-600 rounded-full px-2 py-1">
                        {tableFieldCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Header with Add Button */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedTable} Custom Fields
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {filteredFields.length} custom field{filteredFields.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => {
                setEditingFieldId(null);
                setFormData({ ...formData, tableName: selectedTable, fieldName: '', displayName: '', groupName: '', dataType: 'varchar(255)', isRequired: false, description: '', customTableId: null });
                setShowForm(!showForm);
              }}
              className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <span>+ Add Field</span>
            </button>
          </div>

          {/* Add Field Form */}
          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-6">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{editingFieldId ? 'Edit Custom Field' : 'Add Custom Field'}</h4>
              <form onSubmit={handleSubmitField} className="space-y-4">
                <datalist id="custom-field-groups">
                  {existingGroupNames.map((groupName) => (
                    <option key={groupName} value={groupName} />
                  ))}
                </datalist>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Field Name *
                    </label>
                    <input
                      type="text"
                      value={formData.fieldName}
                      onChange={(e) => setFormData({ ...formData, fieldName: e.target.value })}
                      disabled={editingFieldId !== null}
                      placeholder="e.g., BudgetCode"
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${editingFieldId !== null ? 'border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed' : 'border-gray-300 dark:border-gray-600'}`}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Database name: U_{formData.fieldName}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Display Name *
                    </label>
                    <input
                      type="text"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      placeholder="e.g., Budget Code"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Group
                    </label>
                    <input
                      type="text"
                      value={formData.groupName}
                      onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                      placeholder="e.g., Release Tracking"
                      list="custom-field-groups"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Optional. Fields in the same group render together in forms.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Data Type *
                    </label>
                    <select
                      value={formData.customTableId ? 'int' : formData.dataType}
                      onChange={(e) => setFormData({ ...formData, dataType: e.target.value })}
                      disabled={!!formData.customTableId || editingFieldId !== null}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${(formData.customTableId || editingFieldId !== null) ? 'border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed' : 'border-gray-300 dark:border-gray-600'}`}
                    >
                      {AVAILABLE_DATA_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    {editingFieldId !== null && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Data type cannot be changed after the field is created.</p>
                    )}
                    {formData.customTableId && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Auto-set to int (stores row Id)</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Required
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isRequired}
                        onChange={(e) => setFormData({ ...formData, isRequired: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Make this field required</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description of what this field is used for"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {customTables.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Link to Custom Table
                      <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">(optional — renders a dropdown in forms)</span>
                    </label>
                    <select
                      value={formData.customTableId ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setFormData({ ...formData, customTableId: val, dataType: editingFieldId !== null ? formData.dataType : (val ? 'int' : 'varchar(255)') });
                      }}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">— None —</option>
                      {customTables.map((t) => (
                        <option key={t.Id} value={t.Id}>{t.Name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white transition-colors font-medium"
                  >
                    {isSubmitting ? (editingFieldId ? 'Saving...' : 'Creating...') : (editingFieldId ? 'Save Changes' : 'Create Field')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Fields List */}
          {filteredFields.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                No custom fields for {selectedTable} yet
              </p>
              <button
                onClick={() => {
                  setEditingFieldId(null);
                  setFormData({ ...formData, tableName: selectedTable, fieldName: '', displayName: '', groupName: '', dataType: 'varchar(255)', isRequired: false, description: '', customTableId: null });
                  setShowForm(true);
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Create the first custom field
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFields.map((field) => (
                <div
                  key={field.Id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white">{field.DisplayName || field.FieldName}</h4>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
                          U_{field.FieldName}
                        </span>
                        {field.IsRequired === 1 && (
                          <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded">
                            Required
                          </span>
                        )}
                        {field.GroupName && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded">
                            📁 {field.GroupName}
                          </span>
                        )}
                        {field.CustomTableId && (
                          <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-1 rounded">
                            🗃️ {customTables.find(t => t.Id === field.CustomTableId)?.Name || 'Custom Table'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <span className="font-medium">Type:</span> {field.DataType}
                      </p>
                      {field.Description && (
                        <p className="text-sm text-gray-500 dark:text-gray-500">{field.Description}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">
                        Created: {new Date(field.CreatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleEditField(field)}
                      className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
                      title="Edit custom field"
                      aria-label="Edit custom field"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteField(field.Id, field.DisplayName || field.FieldName)}
                      className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                      title="Delete custom field"
                      aria-label="Delete custom field"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
