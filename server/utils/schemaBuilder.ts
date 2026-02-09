import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../config/database';

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

async function ensureSchemaVersionsTable(): Promise<void> {
  const createTableSQL = `
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
  await pool.execute(
    `INSERT INTO SchemaVersions (TableName, SchemaHash) 
     VALUES (?, ?) 
     ON DUPLICATE KEY UPDATE SchemaHash = ?, LastUpdated = CURRENT_TIMESTAMP`,
    [tableName, schemaHash, schemaHash]
  );
}

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const [rows] = await pool.execute<any[]>(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [tableName]
    );
    return rows.length > 0;
  } catch (error) {
    return false;
  }
}

async function getExistingColumns(tableName: string): Promise<Set<string>> {
  try {
    const [rows] = await pool.execute<any[]>(
      'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
      [tableName]
    );
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
    let columnSQL = `\`${field.FieldName}\` ${field.DataType}`;

    if (field.NotNullable) {
      columnSQL += ' NOT NULL';
    }

    if (field.AutoIncrement) {
      columnSQL += ' AUTO_INCREMENT';
    }

    if (field.DefaultValue !== undefined && !field.AutoIncrement) {
      if (field.DefaultValue === null) {
        columnSQL += ' DEFAULT NULL';
      } else if (field.DefaultValue === true || field.DefaultValue === false) {
        columnSQL += ` DEFAULT ${field.DefaultValue ? 1 : 0}`;
      } else if (typeof field.DefaultValue === 'string') {
        const mysqlKeywords = ['CURRENT_TIMESTAMP', 'NOW()', 'NULL', 'CURRENT_DATE', 'CURRENT_TIME'];
        const isKeyword = mysqlKeywords.some(keyword => 
          field.DefaultValue.toUpperCase().includes(keyword)
        );
        
        if (isKeyword) {
          columnSQL += ` DEFAULT ${field.DefaultValue}`;
        } else {
          columnSQL += ` DEFAULT '${field.DefaultValue}'`;
        }
      } else {
        columnSQL += ` DEFAULT '${field.DefaultValue}'`;
      }
    }

    const alterSQL = `ALTER TABLE \`${tableName}\` ADD COLUMN ${columnSQL}`;
    
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
  const fields = schema.Fields.map((field) => {
    let fieldSQL = `\`${field.FieldName}\` ${field.DataType}`;

    if (field.NotNullable) {
      fieldSQL += ' NOT NULL';
    }

    if (field.AutoIncrement) {
      fieldSQL += ' AUTO_INCREMENT';
    }

    if (field.DefaultValue !== undefined && !field.AutoIncrement) {
      if (field.DefaultValue === null) {
        fieldSQL += ' DEFAULT NULL';
      } else if (field.DefaultValue === true || field.DefaultValue === false) {
        fieldSQL += ` DEFAULT ${field.DefaultValue ? 1 : 0}`;
      } else if (typeof field.DefaultValue === 'string') {
        // Check if it's a MySQL keyword/function (don't quote these)
        const mysqlKeywords = ['CURRENT_TIMESTAMP', 'NOW()', 'NULL', 'CURRENT_DATE', 'CURRENT_TIME'];
        const isKeyword = mysqlKeywords.some(keyword => 
          field.DefaultValue.toUpperCase().includes(keyword)
        );
        
        if (isKeyword) {
          fieldSQL += ` DEFAULT ${field.DefaultValue}`;
        } else {
          fieldSQL += ` DEFAULT '${field.DefaultValue}'`;
        }
      } else {
        fieldSQL += ` DEFAULT '${field.DefaultValue}'`;
      }
    }

    return fieldSQL;
  }).join(',\n  ');

  // Handle composite primary keys - split by comma and wrap each in backticks
  const primaryKeyFields = schema.PrimaryKeyFields.split(',').map(f => `\`${f.trim()}\``).join(', ');
  const primaryKey = `PRIMARY KEY (${primaryKeyFields})`;
  
  const uniqueFields = schema.Fields.filter(f => f.Unique)
    .map(f => `UNIQUE KEY \`${f.FieldName}_UNIQUE\` (\`${f.FieldName}\`)`)
    .join(',\n  ');

  let sql = `CREATE TABLE IF NOT EXISTS \`${schema.TableName}\` (\n  ${fields},\n  ${primaryKey}`;
  
  if (uniqueFields) {
    sql += `,\n  ${uniqueFields}`;
  }
  
  sql += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;';

  return sql;
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
