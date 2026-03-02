import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dbProvider, pool } from '../config/database';

interface Field {
  FieldName: string;
  DataType: string;
  NotNullable?: boolean;
  AutoIncrement?: boolean;
  Unique?: boolean;
  DefaultValue?: any;
}

interface TableSchema {
  TableName: string;
  PrimaryKeyFields: string;
  Fields: Field[];
}

function calculateMD5(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function quoteIdentifier(name: string): string {
  return dbProvider === 'mssql' ? `[${name}]` : `\`${name}\``;
}

function mapDataType(dataType: string): string {
  if (dbProvider === 'mysql') {
    return dataType;
  }

  const normalized = dataType.trim().toLowerCase();

  const enumMatch = normalized.match(/^enum\((.*)\)$/i);
  if (enumMatch) {
    const valuesRaw = enumMatch[1]
      .split(',')
      .map(value => value.trim().replace(/^'+|'+$/g, ''));
    const maxLen = valuesRaw.reduce((max, value) => Math.max(max, value.length), 1);
    const boundedLen = Math.min(Math.max(maxLen, 1), 4000);
    return `nvarchar(${boundedLen})`;
  }

  if (normalized === 'boolean' || normalized === 'bool') return 'bit';
  if (normalized === 'tinyint(1)') return 'bit';
  if (normalized.startsWith('varchar(')) {
    const size = Number(normalized.replace('varchar(', '').replace(')', ''));
    if (!Number.isNaN(size) && size > 0 && size <= 4000) {
      return `nvarchar(${size})`;
    }
    return 'nvarchar(max)';
  }
  if (normalized === 'text' || normalized === 'mediumtext' || normalized === 'longtext' || normalized === 'json') {
    return 'nvarchar(max)';
  }
  if (normalized === 'timestamp' || normalized === 'datetime') return 'datetime2';
  if (normalized === 'double') return 'float';

  return dataType;
}

function getDefaultSql(field: Field): string {
  if (field.DefaultValue === undefined || field.AutoIncrement) {
    return '';
  }

  if (field.DefaultValue === null) {
    return ' DEFAULT NULL';
  }

  if (field.DefaultValue === true || field.DefaultValue === false) {
    return ` DEFAULT ${field.DefaultValue ? 1 : 0}`;
  }

  if (typeof field.DefaultValue === 'number') {
    return ` DEFAULT ${field.DefaultValue}`;
  }

  const defaultValue = String(field.DefaultValue).trim();
  const upper = defaultValue.toUpperCase();

  if (dbProvider === 'mssql') {
    if (upper.includes('CURRENT_TIMESTAMP') || upper.includes('NOW()')) return ' DEFAULT GETDATE()';
    if (upper === 'CURRENT_DATE') return ' DEFAULT CAST(GETDATE() AS DATE)';
    if (upper === 'CURRENT_TIME') return ' DEFAULT CONVERT(time, GETDATE())';
    if (upper === 'NULL') return ' DEFAULT NULL';
  } else {
    const mysqlKeywords = ['CURRENT_TIMESTAMP', 'NOW()', 'NULL', 'CURRENT_DATE', 'CURRENT_TIME'];
    if (mysqlKeywords.some(keyword => upper.includes(keyword))) {
      return ` DEFAULT ${defaultValue}`;
    }
  }

  return ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`;
}

function buildColumnDefinition(field: Field, options?: { forAlter?: boolean }): string {
  const forAlter = !!options?.forAlter;
  const dataType = mapDataType(field.DataType);
  let columnSql = `${quoteIdentifier(field.FieldName)} ${dataType}`;

  if (field.AutoIncrement) {
    if (dbProvider === 'mssql') {
      if (forAlter) {
        throw new Error(`MSSQL does not support adding IDENTITY column via ALTER TABLE: ${field.FieldName}`);
      }
      columnSql += ' IDENTITY(1,1)';
    } else {
      columnSql += ' AUTO_INCREMENT';
    }
  }

  columnSql += field.NotNullable ? ' NOT NULL' : ' NULL';
  columnSql += getDefaultSql(field);

  return columnSql;
}

function getPrimaryKeySql(schema: TableSchema): string {
  const primaryKeyFields = schema.PrimaryKeyFields
    .split(',')
    .map(field => quoteIdentifier(field.trim()))
    .join(', ');

  return `PRIMARY KEY (${primaryKeyFields})`;
}

function getUniqueConstraintsSql(schema: TableSchema): string[] {
  const uniqueFields = schema.Fields.filter(field => field.Unique);
  if (uniqueFields.length === 0) {
    return [];
  }

  if (dbProvider === 'mssql') {
    return uniqueFields.map(field => {
      const constraintName = `UQ_${schema.TableName}_${field.FieldName}`;
      return `CONSTRAINT ${quoteIdentifier(constraintName)} UNIQUE (${quoteIdentifier(field.FieldName)})`;
    });
  }

  return uniqueFields.map(field =>
    `UNIQUE KEY ${quoteIdentifier(`${field.FieldName}_UNIQUE`)} (${quoteIdentifier(field.FieldName)})`
  );
}

async function ensureSchemaVersionsTable(): Promise<void> {
  const createTableSQL = dbProvider === 'mssql'
    ? `
      IF OBJECT_ID(N'dbo.SchemaVersions', N'U') IS NULL
      BEGIN
        CREATE TABLE [SchemaVersions] (
          [Id] INT IDENTITY(1,1) NOT NULL,
          [TableName] NVARCHAR(255) NOT NULL UNIQUE,
          [SchemaHash] NVARCHAR(32) NOT NULL,
          [LastUpdated] DATETIME2 NOT NULL DEFAULT GETDATE(),
          CONSTRAINT [PK_SchemaVersions] PRIMARY KEY ([Id])
        );
      END
    `
    : `
      CREATE TABLE IF NOT EXISTS SchemaVersions (
        Id INT NOT NULL AUTO_INCREMENT,
        TableName VARCHAR(255) NOT NULL UNIQUE,
        SchemaHash VARCHAR(32) NOT NULL,
        LastUpdated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (Id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
  
  await pool.execute(createTableSQL);
}

async function getStoredSchemaHash(tableName: string): Promise<string | null> {
  try {
    const [rows] = await pool.execute<any[]>(
      'SELECT SchemaHash FROM SchemaVersions WHERE TableName = ?',
      [tableName]
    );
    return rows.length > 0 ? rows[0].SchemaHash : null;
  } catch (error) {
    return null;
  }
}

async function updateSchemaHash(tableName: string, schemaHash: string): Promise<void> {
  const [updateResult, updateMeta] = await pool.execute(
    `UPDATE SchemaVersions SET SchemaHash = ?, LastUpdated = CURRENT_TIMESTAMP WHERE TableName = ?`,
    [schemaHash, tableName]
  );

  const affectedRows = Number(
    (updateResult as any)?.affectedRows
    || (updateResult as any)?.rowsAffected?.[0]
    || (updateMeta as any)?.affectedRows
    || 0
  );
  if (affectedRows === 0) {
    await pool.execute(
      `INSERT INTO SchemaVersions (TableName, SchemaHash) VALUES (?, ?)`,
      [tableName, schemaHash]
    );
  }
}

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const tableExistsSql = dbProvider === 'mssql'
      ? 'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?'
      : 'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?';

    const tableExistsParams = dbProvider === 'mssql'
      ? ['dbo', tableName]
      : [tableName];

    const [rows] = await pool.execute<any[]>(tableExistsSql, tableExistsParams);
    return rows.length > 0;
  } catch (error) {
    return false;
  }
}

async function getExistingColumns(tableName: string): Promise<Set<string>> {
  try {
    const columnsSql = dbProvider === 'mssql'
      ? 'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?'
      : 'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?';

    const columnParams = dbProvider === 'mssql'
      ? ['dbo', tableName]
      : [tableName];

    const [rows] = await pool.execute<any[]>(columnsSql, columnParams);
    return new Set(rows.map((row: any) => row.COLUMN_NAME));
  } catch (error) {
    return new Set();
  }
}

async function addMissingColumns(tableName: string, schema: TableSchema): Promise<void> {
  const existingColumns = await getExistingColumns(tableName);
  const columnsToAdd: Field[] = [];

  for (const field of schema.Fields) {
    if (!existingColumns.has(field.FieldName)) {
      columnsToAdd.push(field);
    }
  }

  if (columnsToAdd.length === 0) {
    console.log(`  ℹ No new columns to add`);
    return;
  }

  console.log(`  + Adding ${columnsToAdd.length} new column(s)...`);
  
  for (const field of columnsToAdd) {
    let columnSQL: string;
    try {
      columnSQL = buildColumnDefinition(field, { forAlter: true });
    } catch (error: any) {
      console.warn(`    ⚠ Skipping column ${field.FieldName}: ${error.message}`);
      continue;
    }

    const alterSQL = dbProvider === 'mssql'
      ? `ALTER TABLE ${quoteIdentifier(tableName)} ADD ${columnSQL}`
      : `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnSQL}`;
    
    try {
      await pool.execute(alterSQL);
      console.log(`    ✓ Added column: ${field.FieldName}`);
    } catch (error: any) {
      console.error(`    ✗ Failed to add column ${field.FieldName}:`, error.message);
    }
  }
}

export async function buildTableFromJSON(schemaPath: string): Promise<void> {
  try {
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const schema: TableSchema = JSON.parse(schemaContent);
    const schemaHash = calculateMD5(schemaContent);

    // Check if table exists
    const exists = await tableExists(schema.TableName);

    if (exists) {
      // Table exists, check if schema has changed
      const storedHash = await getStoredSchemaHash(schema.TableName);
      
      if (storedHash === schemaHash) {
        console.log(`✓ Table '${schema.TableName}' is up to date`);
        return;
      }

      console.log(`⚡ Table '${schema.TableName}' schema changed, checking for updates...`);
      await addMissingColumns(schema.TableName, schema);
      await updateSchemaHash(schema.TableName, schemaHash);
      console.log(`✓ Table '${schema.TableName}' updated successfully`);
    } else {
      // Table doesn't exist, create it
      const createTableSQL = generateCreateTableSQL(schema);
      await pool.execute(createTableSQL);
      await updateSchemaHash(schema.TableName, schemaHash);
      console.log(`✓ Table '${schema.TableName}' created successfully`);
    }
  } catch (error: any) {
    console.error(`✗ Error processing table:`, error);
    throw error;
  }
}

function generateCreateTableSQL(schema: TableSchema): string {
  const fieldSqlList = schema.Fields.map(field => buildColumnDefinition(field));
  fieldSqlList.push(getPrimaryKeySql(schema));
  fieldSqlList.push(...getUniqueConstraintsSql(schema));

  const body = fieldSqlList.join(',\n  ');

  if (dbProvider === 'mssql') {
    return `
      IF OBJECT_ID(N'dbo.${schema.TableName}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${quoteIdentifier(schema.TableName)} (
          ${body}
        );
      END
    `;
  }

  return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(schema.TableName)} (\n  ${body}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
}

export async function buildAllTables(structureDir: string): Promise<void> {
  try {
    // First, ensure SchemaVersions table exists
    await ensureSchemaVersionsTable();
    
    const systemTablesPath = path.join(structureDir, 'systemtables');
    
    if (fs.existsSync(systemTablesPath)) {
      const files = fs.readdirSync(systemTablesPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(systemTablesPath, file);
          console.log(`\nProcessing: ${file}`);
          await buildTableFromJSON(filePath);
        }
      }
    }

    console.log('\n✓ All tables processed successfully');
  } catch (error) {
    console.error('✗ Error building tables:', error);
    throw error;
  }
}
