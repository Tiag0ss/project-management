import { pool } from '../config/database';
import { RowDataPacket } from '../config/database';

export interface ActiveCustomFieldDefinition extends RowDataPacket {
  Id: number;
  TableName: string;
  FieldName: string;
  DisplayName: string;
  DataType: string;
  IsRequired: number | boolean;
  Description?: string | null;
}

export interface PreparedCustomFieldData {
  insertColumns: string[];
  insertPlaceholders: string[];
  insertValues: Array<string | number | null>;
  updateAssignments: string[];
  updateValues: Array<string | number | null>;
  changes: Array<{ field: string; oldVal: string; newVal: string }>;
}

const CUSTOM_FIELD_TABLES = new Set([
  'Users',
  'Projects',
  'Tasks',
  'Organizations',
  'Customers',
  'Tickets',
  'TimeEntries',
  'CallRecords',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const isEmptyValue = (value: string | number | null, dataType: string): boolean => {
  if (dataType === 'tinyint(1)') {
    return false;
  }

  return value === null || value === '';
};

const normalizeDateValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  return text.split('T')[0] || null;
};

const normalizeCustomFieldValue = (dataType: string, value: unknown): string | number | null => {
  if (dataType === 'tinyint(1)') {
    if (value === null || value === undefined || value === '') {
      return 0;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    if (typeof value === 'number') {
      return value ? 1 : 0;
    }

    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized) ? 1 : 0;
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (dataType === 'date') {
    return normalizeDateValue(value);
  }

  if (dataType === 'int') {
    if (value === '') {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('Invalid integer value');
    }
    return Math.trunc(parsed);
  }

  if (dataType.startsWith('decimal(')) {
    if (value === '') {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error('Invalid decimal value');
    }
    return parsed;
  }

  const text = String(value).trim();
  return text || null;
};

export const getActiveCustomFields = async (tableName: string): Promise<ActiveCustomFieldDefinition[]> => {
  if (!CUSTOM_FIELD_TABLES.has(tableName)) {
    return [];
  }

  const [rows] = await pool.execute<ActiveCustomFieldDefinition[]>(
    `SELECT Id, TableName, FieldName, DisplayName, DataType, IsRequired, Description
     FROM CustomFields
     WHERE TableName = ? AND IsActive = 1
     ORDER BY FieldName`,
    [tableName]
  );

  return rows;
};

export const prepareCustomFieldData = async (
  tableName: string,
  payload: unknown,
  existingRecord?: Record<string, unknown> | null,
): Promise<PreparedCustomFieldData> => {
  const definitions = await getActiveCustomFields(tableName);
  if (definitions.length === 0) {
    return {
      insertColumns: [],
      insertPlaceholders: [],
      insertValues: [],
      updateAssignments: [],
      updateValues: [],
      changes: [],
    };
  }

  const input = isPlainObject(payload) ? payload : {};
  const isCreateOperation = !existingRecord;
  const prepared: PreparedCustomFieldData = {
    insertColumns: [],
    insertPlaceholders: [],
    insertValues: [],
    updateAssignments: [],
    updateValues: [],
    changes: [],
  };

  for (const definition of definitions) {
    const key = definition.FieldName;
    const dbColumn = `U_${definition.FieldName}`;
    const hasValue = Object.prototype.hasOwnProperty.call(input, key);

    if (!isCreateOperation && !hasValue) {
      continue;
    }

    let normalizedValue: string | number | null;
    try {
      normalizedValue = normalizeCustomFieldValue(
        definition.DataType,
        hasValue ? input[key] : null,
      );
    } catch {
      throw new Error(`Invalid value for custom field ${definition.DisplayName || definition.FieldName}`);
    }

    if (Number(definition.IsRequired) === 1 && isEmptyValue(normalizedValue, definition.DataType)) {
      throw new Error(`Custom field ${definition.DisplayName || definition.FieldName} is required`);
    }

    prepared.insertColumns.push(dbColumn);
    prepared.insertPlaceholders.push('?');
    prepared.insertValues.push(normalizedValue);
    prepared.updateAssignments.push(`${dbColumn} = ?`);
    prepared.updateValues.push(normalizedValue);

    if (existingRecord) {
      const oldValue = existingRecord[dbColumn];
      const oldText = oldValue === null || oldValue === undefined ? '' : String(oldValue);
      const newText = normalizedValue === null || normalizedValue === undefined ? '' : String(normalizedValue);
      if (oldText !== newText) {
        prepared.changes.push({
          field: dbColumn,
          oldVal: oldText,
          newVal: newText,
        });
      }
    }
  }

  return prepared;
};
