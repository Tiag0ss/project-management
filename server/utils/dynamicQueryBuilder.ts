import { pool } from '../config/database';
import { RowDataPacket } from '../config/database';
import { dbProvider } from '../config/database';
import fs from 'fs';
import path from 'path';

interface TableSchema {
  tableName: string;
  fields: FieldSchema[];
  primaryKey: string;
}

interface FieldSchema {
  name: string;
  dataType: string;
  comment?: string;
  isNullable: boolean;
}

function sanitizeSqlAlias(alias: string): string {
  const normalizedAlias = String(alias || '').trim();
  return normalizedAlias || 'Field';
}

function quoteResultAlias(alias: string): string {
  if (dbProvider === 'mssql') {
    return `[${alias.replace(/\]/g, ']]')}]`;
  }
  return `\`${alias.replace(/`/g, '``')}\``;
}

export function getFieldKey(field: { table: string; field: string; alias?: string }): string {
  return sanitizeSqlAlias(field.alias || `${field.table}.${field.field}`);
}

export function getAggregationFunction(inputAggregation: any): 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'DISTINCTCOUNT' {
  const normalized = String(inputAggregation || 'SUM').toUpperCase();
  if (normalized === 'DISTINCTCOUNT') return 'DISTINCTCOUNT';
  if (normalized === 'COUNT') return 'COUNT';
  if (normalized === 'AVG') return 'AVG';
  if (normalized === 'MIN') return 'MIN';
  if (normalized === 'MAX') return 'MAX';
  return 'SUM';
}

export function formatFilterValue(value: string, dataType: string): string {
  const normalizedDataType = dataType.toLowerCase();

  if (normalizedDataType.includes('date') || normalizedDataType.includes('timestamp') || normalizedDataType.includes('datetime')) {
    if (value && value.length >= 8) {
      if (value.match(/^\d{4}-\d{2}-\d{2}$/)) return value;
      if (value.match(/^\d{8}$/)) return `${value.substr(0, 4)}-${value.substr(4, 2)}-${value.substr(6, 2)}`;
      if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const parts = value.split('/');
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      if (value.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) && parseInt(value.split('/')[0]) <= 12) {
        const parts = value.split('/');
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }
    return value;
  }

  if (normalizedDataType.includes('decimal') || normalizedDataType.includes('numeric') || normalizedDataType.includes('float')) {
    if (value.match(/^\d{1,2}:\d{2}$/)) {
      const [hours, minutes] = value.split(':').map(Number);
      return (hours + minutes / 60).toString();
    }
    const num = parseFloat(value);
    return isNaN(num) ? '0' : num.toString();
  }

  return value;
}

export function getFieldDataType(tables: TableSchema[], tableName: string, fieldName: string): string {
  const table = tables.find((t) => t.tableName === tableName);
  if (!table) return 'varchar';
  const field = table.fields.find((f) => f.name === fieldName);
  return field ? field.dataType : 'varchar';
}

export function loadSchemaData(): TableSchema[] {
  const schemaPath = path.join(__dirname, '../database/structure/systemtables');
  const schemaFiles = fs.readdirSync(schemaPath).filter((f) => f.endsWith('.json'));
  const schemaData: TableSchema[] = [];

  for (const file of schemaFiles) {
    const fileContent = fs.readFileSync(path.join(schemaPath, file), 'utf-8');
    const tableSchema = JSON.parse(fileContent);
    const fields: FieldSchema[] = tableSchema.Fields.map((field: any) => ({
      name: field.FieldName,
      dataType: field.DataType,
      comment: field.Comment || '',
      isNullable: !field.NotNullable,
    }));
    schemaData.push({
      tableName: tableSchema.TableName,
      fields,
      primaryKey: tableSchema.PrimaryKeyFields || 'Id',
    });
  }

  return schemaData;
}

/**
 * Execute a dynamic query config (as stored in SavedReports.PivotConfig.dynamicQueryConfig).
 * Returns the raw result rows.
 */
export async function executeDynamicQueryConfig(
  queryConfig: any,
  options?: { limit?: number }
): Promise<Record<string, unknown>[]> {
  const { tables, joins, rowFields, columnFields, valueFields, filters, groupBy } = queryConfig || {};

  if (!tables || !tables.length) {
    throw new Error('At least one table is required in query config');
  }

  const schemaData = loadSchemaData();

  // Build SELECT
  const selectFields: string[] = [];
  [...(rowFields || []), ...(columnFields || [])].forEach((field: any) => {
    const alias = getFieldKey(field);
    selectFields.push(`${field.table}.${field.field} AS ${quoteResultAlias(alias)}`);
  });

  (valueFields || []).forEach((field: any) => {
    const aggFunc = getAggregationFunction(field.aggregation);
    const fieldExpr = `${field.table}.${field.field}`;
    const alias = getFieldKey(field);
    if (aggFunc === 'DISTINCTCOUNT') {
      selectFields.push(`COUNT(DISTINCT ${fieldExpr}) AS ${quoteResultAlias(alias)}`);
    } else if (aggFunc === 'COUNT') {
      selectFields.push(`COUNT(${fieldExpr}) AS ${quoteResultAlias(alias)}`);
    } else {
      selectFields.push(`${aggFunc}(${fieldExpr}) AS ${quoteResultAlias(alias)}`);
    }
  });

  if (selectFields.length === 0) {
    selectFields.push('COUNT(*) AS RecordCount');
  }

  let sql = `SELECT ${selectFields.join(', ')} FROM ${tables[0]}`;

  // JOINs
  if (joins && joins.length > 0) {
    joins.forEach((join: any) => {
      const joinType = join.type || 'LEFT';
      sql += ` ${joinType} JOIN ${join.table} ON ${join.leftTable}.${join.leftField} = ${join.rightTable}.${join.rightField}`;
    });
  }

  // Validate all tables are joined
  const joinedTables = new Set([tables[0], ...(joins || []).map((j: any) => j.table)]);
  const missingTables = (tables as string[]).filter((t: string) => !joinedTables.has(t));
  if (missingTables.length > 0) {
    throw new Error(`Tables not joined in dynamic query config: ${missingTables.join(', ')}`);
  }

  // WHERE
  const whereParams: any[] = [];
  if (filters && filters.length > 0) {
    const conditions: string[] = [];
    filters.forEach((filter: any) => {
      const field = `${filter.table}.${filter.field}`;
      const fieldDataType = getFieldDataType(schemaData, filter.table, filter.field);

      switch (filter.operator) {
        case 'equals':
          conditions.push(`${field} = ?`);
          whereParams.push(formatFilterValue(filter.value, fieldDataType));
          break;
        case 'notEquals':
          conditions.push(`${field} != ?`);
          whereParams.push(formatFilterValue(filter.value, fieldDataType));
          break;
        case 'contains':
          conditions.push(`${field} LIKE ?`);
          whereParams.push(`%${filter.value}%`);
          break;
        case 'startsWith':
          conditions.push(`${field} LIKE ?`);
          whereParams.push(`${filter.value}%`);
          break;
        case 'endsWith':
          conditions.push(`${field} LIKE ?`);
          whereParams.push(`%${filter.value}`);
          break;
        case 'greaterThan':
          conditions.push(`${field} > ?`);
          whereParams.push(formatFilterValue(filter.value, fieldDataType));
          break;
        case 'lessThan':
          conditions.push(`${field} < ?`);
          whereParams.push(formatFilterValue(filter.value, fieldDataType));
          break;
        case 'between':
        case 'dateRange':
          conditions.push(`${field} BETWEEN ? AND ?`);
          whereParams.push(formatFilterValue(filter.value, fieldDataType), formatFilterValue(filter.value2, fieldDataType));
          break;
        case 'isEmpty':
          conditions.push(`(${field} IS NULL OR ${field} = '')`);
          break;
        case 'notEmpty':
          conditions.push(`(${field} IS NOT NULL AND ${field} != '')`);
          break;
        case 'inList':
          if (filter.valueList && filter.valueList.length > 0) {
            const placeholders = filter.valueList.map(() => '?').join(', ');
            conditions.push(`${field} IN (${placeholders})`);
            whereParams.push(...filter.valueList.map((v: string) => formatFilterValue(v, fieldDataType)));
          }
          break;
        default:
          break;
      }
    });
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
  }

  // GROUP BY
  if (groupBy && groupBy.length > 0) {
    sql += ' GROUP BY ' + groupBy.map((f: any) => `${f.table}.${f.field}`).join(', ');
  } else if ((rowFields && rowFields.length > 0) || (columnFields && columnFields.length > 0)) {
    const groupFields = [
      ...(rowFields || []).map((f: any) => `${f.table}.${f.field}`),
      ...(columnFields || []).map((f: any) => `${f.table}.${f.field}`),
    ];
    if (groupFields.length > 0) {
      sql += ' GROUP BY ' + groupFields.join(', ');
    }
  }

  // ORDER BY
  if ((rowFields && rowFields.length > 0) || (columnFields && columnFields.length > 0)) {
    const orderFields = [
      ...(rowFields || []).map((f: any) => `${f.table}.${f.field}`),
      ...(columnFields || []).map((f: any) => `${f.table}.${f.field}`),
    ];
    if (orderFields.length > 0) {
      sql += ' ORDER BY ' + orderFields.join(', ');
    }
  }

  // LIMIT
  if (options?.limit && options.limit > 0) {
    sql += ` LIMIT ${Math.max(1, Math.floor(options.limit))}`;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(sql, whereParams);
  return rows as Record<string, unknown>[];
}
