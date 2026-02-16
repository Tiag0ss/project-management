import express, { Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { RowDataPacket } from 'mysql2';
import fs from 'fs';
import path from 'path';

const router = express.Router();

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

interface TableRelation {
  fromTable: string;
  fromField: string;
  toTable: string;
  toField: string;
  name?: string;
  description?: string;
  type?: string;
}

// Helper function to format filter values based on field data type
function formatFilterValue(value: string, dataType: string): string {
  const normalizedDataType = dataType.toLowerCase();
  
  // Handle date types - convert to YYYY-MM-DD format
  if (normalizedDataType.includes('date') || normalizedDataType.includes('timestamp') || normalizedDataType.includes('datetime')) {
    if (value && value.length >= 8) {
      // If already in YYYY-MM-DD format, keep it
      if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return value;
      }
      // If in YYYYMMDD format, convert to YYYY-MM-DD
      if (value.match(/^\d{8}$/)) {
        return `${value.substr(0,4)}-${value.substr(4,2)}-${value.substr(6,2)}`;
      }
      // If in DD/MM/YYYY format, convert
      if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const parts = value.split('/');
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      // If in MM/DD/YYYY format, convert  
      if (value.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) && parseInt(value.split('/')[0]) <= 12) {
        const parts = value.split('/');
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        return `${parts[2]}-${month}-${day}`;
      }
    }
    return value;
  }
  
  // Handle decimal/numeric types for hours
  if (normalizedDataType.includes('decimal') || normalizedDataType.includes('numeric') || normalizedDataType.includes('float')) {
    // Convert time format HH:MM to decimal hours if needed
    if (value.match(/^\d{1,2}:\d{2}$/)) {
      const [hours, minutes] = value.split(':').map(Number);
      return (hours + minutes / 60).toString();
    }
    // Ensure it's a valid decimal number
    const num = parseFloat(value);
    return isNaN(num) ? '0' : num.toString();
  }
  
  return value;
}

// Helper function to get field data type from schema
function getFieldDataType(tables: TableSchema[], tableName: string, fieldName: string): string {
  const table = tables.find(t => t.tableName === tableName);
  if (!table) return 'varchar';
  
  const field = table.fields.find(f => f.name === fieldName);
  return field ? field.dataType : 'varchar';
}

// Get database schema with all tables and fields
router.get('/schema', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const schemaPath = path.join(__dirname, '../database/structure/systemtables');
    const schemaFiles = fs.readdirSync(schemaPath).filter(f => f.endsWith('.json'));
    
    const tables: TableSchema[] = [];
    const relations: TableRelation[] = [];
    
    for (const file of schemaFiles) {
      const fileContent = fs.readFileSync(path.join(schemaPath, file), 'utf-8');
      const tableSchema = JSON.parse(fileContent);
      
      const fields: FieldSchema[] = tableSchema.Fields.map((field: any) => ({
        name: field.FieldName,
        dataType: field.DataType,
        comment: field.Comment || '',
        isNullable: !field.NotNullable
      }));
      
      tables.push({
        tableName: tableSchema.TableName,
        fields,
        primaryKey: tableSchema.PrimaryKeyFields || 'Id'
      });
      
      // Get relationships from the new "Relationships" section
      if (tableSchema.Relationships && Array.isArray(tableSchema.Relationships)) {
        tableSchema.Relationships.forEach((rel: any) => {
          const relation = {
            fromTable: tableSchema.TableName,
            fromField: rel.FromField,
            toTable: rel.ToTable,
            toField: rel.ToField,
            name: rel.Name,
            description: rel.Description,
            type: rel.Type
          };
          console.log(`✓ Found relationship: ${tableSchema.TableName}.${rel.FromField} → ${rel.ToTable}.${rel.ToField} (${rel.Description})`);
          relations.push(relation);
        });
      }
      
      // Fallback: Detect foreign key relations from comments (legacy support)
      tableSchema.Fields.forEach((field: any) => {
        if (field.Comment && field.Comment.includes('Foreign key - reference to')) {
          const match = field.Comment.match(/reference to (\w+)\.(\w+)/);
          if (match) {
            const relation = {
              fromTable: tableSchema.TableName,
              fromField: field.FieldName,
              toTable: match[1],
              toField: match[2]
            };
            console.log(`✓ Legacy FK: ${tableSchema.TableName}.${field.FieldName} → ${match[1]}.${match[2]}`);
            // Only add if not already added from Relationships section
            const exists = relations.some(r => 
              r.fromTable === relation.fromTable && 
              r.fromField === relation.fromField &&
              r.toTable === relation.toTable &&
              r.toField === relation.toField
            );
            if (!exists) {
              relations.push(relation);
            }
          }
        }
      });
    }
    
    console.log(`📊 Schema processed: ${tables.length} tables, ${relations.length} relationships`);
    
    res.json({ 
      success: true, 
      schema: {
        tables,
        relations
      }
    });
  } catch (error) {
    console.error('Error fetching database schema:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch database schema' });
  }
});

// Execute dynamic query based on user-defined configuration
router.post('/query', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { 
      tables,          // Array of table names to query
      joins,           // Array of join definitions
      fields,          // Array of selected fields with aggregations
      groupBy,         // Array of fields to group by (rows + columns)
      filters,         // Array of WHERE conditions
      rowFields,       // Fields used as rows
      columnFields,    // Fields used as columns
      valueFields      // Fields used as values with aggregations
    } = req.body;

    if (!tables || !tables.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one table is required' 
      });
    }

    // Load schema for data type validation
    const schemaPath = path.join(__dirname, '../database/structure/systemtables');
    const schemaFiles = fs.readdirSync(schemaPath).filter(f => f.endsWith('.json'));
    const schemaData: TableSchema[] = [];
    
    for (const file of schemaFiles) {
      const fileContent = fs.readFileSync(path.join(schemaPath, file), 'utf-8');
      const tableSchema = JSON.parse(fileContent);
      
      const fields: FieldSchema[] = tableSchema.Fields.map((field: any) => ({
        name: field.FieldName,
        dataType: field.DataType,
        comment: field.Comment || '',
        isNullable: !field.NotNullable
      }));
      
      schemaData.push({
        tableName: tableSchema.TableName,
        fields,
        primaryKey: tableSchema.PrimaryKeyFields || 'Id'
      });
    }

    // Build SELECT clause
    let selectClause = 'SELECT ';
    const selectFields: string[] = [];
    
    // Add row and column fields
    [...(rowFields || []), ...(columnFields || [])].forEach((field: any) => {
      const alias = field.alias || `${field.table}.${field.field}`;
      selectFields.push(`${field.table}.${field.field} AS \`${alias}\``);
    });
    
    // Add value fields with aggregations
    (valueFields || []).forEach((field: any) => {
      const aggFunc = field.aggregation.toUpperCase();
      let fieldExpr = `${field.table}.${field.field}`;
      const alias = field.alias || field.field;
      
      if (aggFunc === 'DISTINCTCOUNT') {
        selectFields.push(`COUNT(DISTINCT ${fieldExpr}) AS \`${alias}\``);
      } else if (aggFunc === 'COUNT') {
        selectFields.push(`COUNT(${fieldExpr}) AS \`${alias}\``);
      } else {
        selectFields.push(`${aggFunc}(${fieldExpr}) AS \`${alias}\``);
      }
    });
    
    if (selectFields.length === 0) {
      selectFields.push('COUNT(*) AS RecordCount');
    }
    
    selectClause += selectFields.join(', ');
    
    // Build FROM clause with main table
    let fromClause = ` FROM ${tables[0]}`;
    
    // Build JOIN clauses - ensure all selected tables are included
    if (joins && joins.length > 0) {
      joins.forEach((join: any) => {
        const joinType = join.type || 'LEFT';
        fromClause += ` ${joinType} JOIN ${join.table} ON ${join.leftTable}.${join.leftField} = ${join.rightTable}.${join.rightField}`;
      });
    }
    
    // Verify all selected tables are in the query (FROM + JOINs)
    const joinedTables = new Set([tables[0], ...joins.map((j: any) => j.table)]);
    const missingTables = tables.filter((t: string) => !joinedTables.has(t));
    if (missingTables.length > 0) {
      console.log('Missing tables in joins:', { 
        selectedTables: tables, 
        joinedTables: Array.from(joinedTables),
        missingTables,
        joins 
      });
      return res.status(400).json({
        success: false,
        message: `The following tables are selected but not joined: ${missingTables.join(', ')}. Please ensure all tables have valid relationships.`
      });
    }
    
    // Build WHERE clause
    let whereClause = '';
    if (filters && filters.length > 0) {
      const conditions: string[] = [];
      filters.forEach((filter: any) => {
        const field = `${filter.table}.${filter.field}`;
        const fieldDataType = getFieldDataType(schemaData, filter.table, filter.field);
        
        switch (filter.operator) {
          case 'equals':
            const formattedValue = formatFilterValue(filter.value, fieldDataType);
            conditions.push(`${field} = ${pool.escape(formattedValue)}`);
            break;
          case 'notEquals':
            const formattedValueNE = formatFilterValue(filter.value, fieldDataType);
            conditions.push(`${field} != ${pool.escape(formattedValueNE)}`);
            break;
          case 'contains':
            conditions.push(`${field} LIKE ${pool.escape('%' + filter.value + '%')}`);
            break;
          case 'startsWith':
            conditions.push(`${field} LIKE ${pool.escape(filter.value + '%')}`);
            break;
          case 'endsWith':
            conditions.push(`${field} LIKE ${pool.escape('%' + filter.value)}`);
            break;
          case 'greaterThan':
            const formattedValueGT = formatFilterValue(filter.value, fieldDataType);
            conditions.push(`${field} > ${pool.escape(formattedValueGT)}`);
            break;
          case 'lessThan':
            const formattedValueLT = formatFilterValue(filter.value, fieldDataType);
            conditions.push(`${field} < ${pool.escape(formattedValueLT)}`);
            break;
          case 'between':
            const formattedValue1 = formatFilterValue(filter.value, fieldDataType);
            const formattedValue2 = formatFilterValue(filter.value2, fieldDataType);
            conditions.push(`${field} BETWEEN ${pool.escape(formattedValue1)} AND ${pool.escape(formattedValue2)}`);
            break;
          case 'isEmpty':
            conditions.push(`(${field} IS NULL OR ${field} = '')`);
            break;
          case 'notEmpty':
            conditions.push(`(${field} IS NOT NULL AND ${field} != '')`);
            break;
          case 'inList':
            if (filter.valueList && filter.valueList.length > 0) {
              const escapedValues = filter.valueList.map((v: string) => {
                const formattedV = formatFilterValue(v, fieldDataType);
                return pool.escape(formattedV);
              }).join(', ');
              conditions.push(`${field} IN (${escapedValues})`);
            }
            break;
          case 'dateRange':
            const formattedDateValue1 = formatFilterValue(filter.value, fieldDataType);
            const formattedDateValue2 = formatFilterValue(filter.value2, fieldDataType);
            conditions.push(`${field} BETWEEN ${pool.escape(formattedDateValue1)} AND ${pool.escape(formattedDateValue2)}`);
            break;
        }
      });
      
      if (conditions.length > 0) {
        whereClause = ' WHERE ' + conditions.join(' AND ');
      }
    }
    
    // Build GROUP BY clause
    let groupByClause = '';
    if (groupBy && groupBy.length > 0) {
      const groupFields = groupBy.map((field: any) => `${field.table}.${field.field}`);
      groupByClause = ' GROUP BY ' + groupFields.join(', ');
    } else if ((rowFields && rowFields.length > 0) || (columnFields && columnFields.length > 0)) {
      const groupFields = [
        ...(rowFields || []).map((f: any) => `${f.table}.${f.field}`),
        ...(columnFields || []).map((f: any) => `${f.table}.${f.field}`)
      ];
      if (groupFields.length > 0) {
        groupByClause = ' GROUP BY ' + groupFields.join(', ');
      }
    }
    
    // Build ORDER BY clause
    let orderByClause = '';
    if ((rowFields && rowFields.length > 0) || (columnFields && columnFields.length > 0)) {
      const orderFields = [
        ...(rowFields || []).map((f: any) => `${f.table}.${f.field}`),
        ...(columnFields || []).map((f: any) => `${f.table}.${f.field}`)
      ];
      if (orderFields.length > 0) {
        orderByClause = ' ORDER BY ' + orderFields.join(', ');
      }
    }
    
    // Combine all clauses
    const query = selectClause + fromClause + whereClause + groupByClause + orderByClause;
    
    console.log('Executing dynamic query:', query);
    
    // Execute the query
    const [results] = await pool.execute<RowDataPacket[]>(query);
    
    res.json({ 
      success: true, 
      data: results,
      query: query // Return query for debugging
    });
    
  } catch (error: any) {
    console.error('Error executing dynamic query:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to execute query',
      error: error.message 
    });
  }
});

// Get sample data from a table (first 10 rows)
router.get('/sample/:tableName', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const tableName = String(Array.isArray(req.params.tableName) ? req.params.tableName[0] : req.params.tableName);
    
    // Validate table name (only allow alphanumeric and underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid table name' 
      });
    }
    
    const [results] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM ${tableName} LIMIT 10`
    );
    
    res.json({ 
      success: true, 
      data: results
    });
  } catch (error: any) {
    console.error('Error fetching sample data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch sample data',
      error: error.message 
    });
  }
});

export default router;
