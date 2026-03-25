export interface CustomFieldDefinition {
  Id: number;
  TableName: string;
  FieldName: string;
  DisplayName: string;
  DataType: string;
  IsRequired: number | boolean;
  Description?: string | null;
}

export type CustomFieldValues = Record<string, string | number | boolean | null | undefined>;

export const extractCustomFieldValues = (record: unknown): CustomFieldValues => {
  if (!record || typeof record !== 'object') {
    return {};
  }

  const values: CustomFieldValues = {};
  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    if (!key.startsWith('U_')) continue;
    values[key.slice(2)] = value as string | number | boolean | null | undefined;
  }

  return values;
};

export const normalizeCustomFieldInputValue = (
  dataType: string,
  value: string | number | boolean | null | undefined,
): string | number | boolean | null => {
  if (value === undefined) return null;

  if (dataType === 'tinyint(1)') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['1', 'true', 'yes', 'on'].includes(normalized);
    }
    return false;
  }

  if (value === null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (dataType === 'int' || dataType.startsWith('decimal(')) {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (dataType === 'date') {
      return trimmed.split('T')[0] || null;
    }

    return trimmed;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  return value;
};
