'use client';

import { getApiUrl } from '@/lib/api/config';
import { useState, useEffect } from 'react';

interface FieldSchema {
  name: string;
  dataType: string;
  comment?: string;
  isNullable: boolean;
}

interface TableSchema {
  tableName: string;
  fields: FieldSchema[];
  primaryKey: string;
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

interface DatabaseSchema {
  tables: TableSchema[];
  relations: TableRelation[];
}

interface SelectedField {
  table: string;
  field: string;
  alias?: string;
  aggregation?: string;
}

interface FilterCondition {
  table: string;
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between' | 'isEmpty' | 'notEmpty' | 'inList' | 'dateRange';
  value: string;
  value2?: string; // For between and dateRange operators
  valueList?: string[]; // For inList operator
}

interface JoinDefinition {
  type: 'LEFT' | 'INNER' | 'RIGHT';
  table: string;
  leftTable: string;
  leftField: string;
  rightTable: string;
  rightField: string;
}

interface DynamicQueryBuilderProps {
  token: string;
  onDataLoaded: (data: any[], fields: any[], pivotConfig: {
    rows: string[];
    columns: string[];
    values: { field: string; aggregation: string; }[];
  }) => void;
}

export default function DynamicQueryBuilder({ token, onDataLoaded }: DynamicQueryBuilderProps) {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [joins, setJoins] = useState<JoinDefinition[]>([]);
  const [availableRelationships, setAvailableRelationships] = useState<{
    [tableName: string]: Array<{
      alias: string;
      description: string;
      relation: TableRelation;
      isUsed: boolean;
    }>;
  }>({});
  const [rowFields, setRowFields] = useState<SelectedField[]>([]);
  const [columnFields, setColumnFields] = useState<SelectedField[]>([]);
  const [valueFields, setValueFields] = useState<SelectedField[]>([]);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDiagram, setShowDiagram] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownValues, setDropdownValues] = useState<{[key: string]: string}>({});

  useEffect(() => {
    loadSchema();
  }, [token]);

  // Helper function to generate meaningful relationship descriptions
  const generateRelationshipDescription = (rel: TableRelation) => {
    // Use the description from the JSON if available
    if (rel.description) {
      return rel.description;
    }
    
    // Use the name from the JSON if available
    if (rel.name) {
      return rel.name.replace(/([A-Z])/g, ' $1').trim(); // Add spaces before capital letters
    }
    
    // Fallback to field-based logic
    const fieldName = rel.fromField.toLowerCase();
    
    if (fieldName.includes('assigned') || fieldName === 'assignedto') {
      return 'Assigned User';
    } else if (fieldName.includes('created') || fieldName === 'createdby') {
      return 'Creator';
    } else if (fieldName.includes('manager') || fieldName === 'managerid') {
      return 'Manager';
    } else if (fieldName.includes('owner') || fieldName === 'ownerid') {
      return 'Owner';
    } else if (fieldName.includes('customer') || fieldName === 'customerid') {
      return 'Customer';
    } else if (fieldName.includes('organization') || fieldName === 'organizationid') {
      return 'Organization';
    } else if (fieldName.includes('project') || fieldName === 'projectid') {
      return 'Project';
    } else if (fieldName.includes('parent') || fieldName === 'parentid') {
      return 'Parent';
    } else if (fieldName.includes('user') || fieldName === 'userid') {
      return 'User';
    } else {
      // Fallback: use field name without "Id"
      return rel.fromField.replace(/Id$/, '');
    }
  };

  // Helper function to generate table alias
  const generateTableAlias = (tableName: string, description: string) => {
    if (description === tableName) return tableName;
    return `${tableName}_${description.replace(/\s+/g, '')}`;
  };

  const loadSchema = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dynamic-reports/schema`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSchema(data.schema);
        
        // Build available relationships mapping
        const relationshipsMap: typeof availableRelationships = {};
        
        console.log(`📊 Schema loaded: ${data.schema.tables.length} tables, ${data.schema.relations.length} relationships`);
        console.log('Available tables:', data.schema.tables.map((t: TableSchema) => t.tableName));
        
        data.schema.tables.forEach((table: TableSchema) => {
          // Get relationships where this table is the TARGET (toTable)
          const incomingRelations = data.schema.relations.filter(
            (rel: TableRelation) => rel.toTable === table.tableName
          );
          
          // Get relationships where this table is the SOURCE (fromTable) 
          const outgoingRelations = data.schema.relations.filter(
            (rel: TableRelation) => rel.fromTable === table.tableName
          );
          
          // Combine both types of relationships
          const allTableRelations = [...incomingRelations, ...outgoingRelations];
          
          console.log(`🔗 Relationships for ${table.tableName}:`, {
            incoming: incomingRelations.map((r: TableRelation) => `${r.fromTable}.${r.fromField} → ${r.toTable}.${r.toField}`),
            outgoing: outgoingRelations.map((r: TableRelation) => `${r.fromTable}.${r.fromField} → ${r.toTable}.${r.toField}`),
            total: allTableRelations.length
          });
          
          if (allTableRelations.length > 0) {
            relationshipsMap[table.tableName] = allTableRelations.map((rel: TableRelation) => {
              const description = generateRelationshipDescription(rel);
              const alias = generateTableAlias(table.tableName, description);
              
              return {
                alias,
                description: `${table.tableName} (${description})`,
                relation: rel,
                isUsed: false
              };
            });
          }
        });
        
        console.log(`✓ Schema relationships built for ${Object.keys(relationshipsMap).length} tables`);
        setAvailableRelationships(relationshipsMap);
      } else {
        setError('Failed to load database schema');
      }
    } catch (err) {
      console.error('Failed to load schema:', err);
      setError('Failed to load database schema');
    }
  };

  // Handle selecting table as base table (FROM clause)
  const handleBaseTableSelect = (tableName: string) => {
    console.log(`📈 ${selectedTables.includes(tableName) ? 'Removing' : 'Adding'} table: ${tableName}`);
    
    if (selectedTables.includes(tableName)) {
      console.log('Removing table:', tableName);
      // Remove table
      setSelectedTables(prev => prev.filter(t => t !== tableName));
      // Remove joins involving this table
      setJoins(prev => prev.filter(j => j.table !== tableName && j.leftTable !== tableName && j.rightTable !== tableName));
      // Remove fields from this table
      setRowFields(prev => prev.filter(f => f.table !== tableName));
      setColumnFields(prev => prev.filter(f => f.table !== tableName));
      setValueFields(prev => prev.filter(f => f.table !== tableName));
      // Remove filters from this table
      setFilters(prev => prev.filter(f => f.table !== tableName));
    } else {
      const newSelectedTables = [...selectedTables, tableName];
      setSelectedTables(newSelectedTables);
      
      // No joins needed if this is the only table or base table
      if (newSelectedTables.length === 1) {
        setJoins([]);
      }
    }
  };

  // Handle selecting specific relationship
  const handleRelationshipSelect = (tableName: string, relationshipAlias: string, relation: TableRelation) => {
    console.log(`🔗 Selecting relationship for ${tableName}: ${relation.fromTable}.${relation.fromField} → ${relation.toTable}.${relation.toField}`);
    
    if (selectedTables.includes(tableName)) {
      // Table already selected, toggle this specific relationship
      const existingJoin = joins.find(j => 
        // Exact match for this specific relationship
        j.leftField === relation.fromField && j.rightField === relation.toField &&
        j.leftTable === relation.fromTable && j.rightTable === relation.toTable
      );
      
      if (existingJoin) {
        console.log('Removing existing join:', existingJoin);
        // Remove this specific join
        setJoins(prev => prev.filter(j => j !== existingJoin));
      } else {
        console.log('Adding new join for already selected table');
        // Don't add extra tables - both should already be selected
        const newJoin: JoinDefinition = {
          type: 'LEFT',
          table: tableName,
          leftTable: relation.fromTable,
          leftField: relation.fromField,
          rightTable: relation.toTable,
          rightField: relation.toField
        };
        console.log('New join:', newJoin);
        setJoins(prev => [...prev, newJoin]);
      }
    } else {
      console.log('Adding new table with relationship');
      // Table not selected, add it along with any missing related tables
      let newSelectedTables = [...selectedTables];
      
      // Ensure both tables from the relationship are in selectedTables
      if (!newSelectedTables.includes(tableName)) {
        newSelectedTables.push(tableName);
      }
      if (!newSelectedTables.includes(relation.fromTable)) {
        newSelectedTables.push(relation.fromTable);
        console.log('Also adding fromTable to selection:', relation.fromTable);
      }
      if (!newSelectedTables.includes(relation.toTable)) {
        newSelectedTables.push(relation.toTable);
        console.log('Also adding toTable to selection:', relation.toTable);
      }
      
      setSelectedTables(newSelectedTables);
      
      // Add the specific join
      const newJoin: JoinDefinition = {
        type: 'LEFT',
        table: tableName,
        leftTable: relation.fromTable,
        leftField: relation.fromField,
        rightTable: relation.toTable,
        rightField: relation.toField
      };
      console.log('New join for new table:', newJoin);
      setJoins(prev => [...prev, newJoin]);
    }
  };

  const handleTableSelect = (tableName: string) => {
    if (selectedTables.includes(tableName)) {
      // Remove table
      setSelectedTables(prev => prev.filter(t => t !== tableName));
      // Remove joins involving this table
      setJoins(prev => prev.filter(j => j.table !== tableName && j.leftTable !== tableName && j.rightTable !== tableName));
      // Remove fields from this table
      setRowFields(prev => prev.filter(f => f.table !== tableName));
      setColumnFields(prev => prev.filter(f => f.table !== tableName));
      setValueFields(prev => prev.filter(f => f.table !== tableName));
    } else {
      const newSelectedTables = [...selectedTables, tableName];
      setSelectedTables(newSelectedTables);
      
      // Rebuild ALL joins for ALL selected tables to ensure proper connections
      if (schema) {
        // Start fresh - we'll rebuild all joins
        const newJoins: any[] = [];
        const alreadyJoined = new Set([newSelectedTables[0]]); // FROM table
        const tablesToJoin = newSelectedTables.slice(1); // All tables except FROM
        
        // Keep trying to add joins until no more progress (handles indirect relationships)
        let madeProgress = true;
        let attempts = 0;
        const maxAttempts = 10; // Prevent infinite loop
        
        while (madeProgress && attempts < maxAttempts) {
          madeProgress = false;
          attempts++;
          
          for (const tableToJoin of tablesToJoin) {
            // Skip if already joined
            if (alreadyJoined.has(tableToJoin)) continue;
            
            // Find a relationship that connects this table to any already-joined table
            const possibleRels = schema.relations.filter(r => {
              // tableToJoin references an already-joined table
              if (r.fromTable === tableToJoin && alreadyJoined.has(r.toTable)) {
                return true;
              }
              // An already-joined table references tableToJoin
              if (r.toTable === tableToJoin && alreadyJoined.has(r.fromTable)) {
                return true;
              }
              return false;
            });
            
            if (possibleRels.length > 0) {
              // Prefer relationships where tableToJoin references existing table
              const rel = possibleRels.find(r => r.fromTable === tableToJoin) || possibleRels[0];
              
              let joinTable, joinLeft, joinLeftField, joinRight, joinRightField;
              
              if (rel.fromTable === tableToJoin) {
                // New table -> Existing table
                joinTable = tableToJoin;
                joinLeft = rel.fromTable;
                joinLeftField = rel.fromField;
                joinRight = rel.toTable;
                joinRightField = rel.toField;
              } else {
                // Existing table -> New table
                joinTable = tableToJoin;
                joinLeft = tableToJoin;
                joinLeftField = rel.toField;
                joinRight = rel.fromTable;
                joinRightField = rel.fromField;
              }
              
              newJoins.push({
                type: 'LEFT',
                table: joinTable,
                leftTable: joinLeft,
                leftField: joinLeftField,
                rightTable: joinRight,
                rightField: joinRightField
              });
              
              alreadyJoined.add(tableToJoin);
              madeProgress = true; // We added a join, try again for remaining tables
            }
          }
        }
        
        setJoins(newJoins);
      }
    }
  };

  const handleAddField = (type: 'row' | 'column' | 'value', table: string, field: string) => {
    const newField: SelectedField = { table, field };
    
    if (type === 'value') {
      newField.aggregation = 'SUM';
    }
    
    if (type === 'row') {
      setRowFields(prev => [...prev, newField]);
    } else if (type === 'column') {
      setColumnFields(prev => [...prev, newField]);
    } else {
      setValueFields(prev => [...prev, newField]);
    }
  };

  const handleRemoveField = (type: 'row' | 'column' | 'value', index: number) => {
    if (type === 'row') {
      setRowFields(prev => prev.filter((_, i) => i !== index));
    } else if (type === 'column') {
      setColumnFields(prev => prev.filter((_, i) => i !== index));
    } else {
      setValueFields(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleUpdateAggregation = (index: number, aggregation: string) => {
    setValueFields(prev => prev.map((f, i) => i === index ? { ...f, aggregation } : f));
  };

  const handleAddFilter = () => {
    if (selectedTables.length > 0) {
      const firstTable = selectedTables[0];
      const firstField = schema?.tables.find(t => t.tableName === firstTable)?.fields[0];
      if (firstField) {
        const newFilter: FilterCondition = {
          table: firstTable,
          field: firstField.name,
          operator: 'equals',
          value: ''
        };
        setFilters(prev => [...prev, newFilter]);
      }
    }
  };

  const handleUpdateFilter = (index: number, updates: Partial<FilterCondition>) => {
    setFilters(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  };

  const handleRemoveFilter = (index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  };

  const handleExecuteQuery = async () => {
    if (selectedTables.length === 0) {
      setError('Please select at least one table');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const requestBody = {
        tables: selectedTables,
        joins,
        rowFields,
        columnFields,
        valueFields,
        filters,
        groupBy: [...rowFields, ...columnFields]
      };

      console.log('Executing query with:', { 
        tables: selectedTables, 
        joins,
        rowFields, 
        columnFields, 
        valueFields,
        filters
      });

      const response = await fetch(`${getApiUrl()}/api/dynamic-reports/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        
        // Build field definitions for the pivot table
        const fields = [
          ...rowFields.map(f => ({ 
            key: `${f.table}.${f.field}`, 
            label: f.alias || `${f.table}.${f.field}`, 
            type: 'text' as const 
          })),
          ...columnFields.map(f => ({ 
            key: `${f.table}.${f.field}`, 
            label: f.alias || `${f.table}.${f.field}`, 
            type: 'text' as const 
          })),
          ...valueFields.map(f => ({ 
            key: f.alias || f.field, 
            label: f.alias || `${f.aggregation}(${f.table}.${f.field})`, 
            type: 'number' as const 
          }))
        ];
        
        onDataLoaded(result.data, fields, {
          rows: rowFields.map(f => `${f.table}.${f.field}`),
          columns: columnFields.map(f => `${f.table}.${f.field}`),
          values: valueFields.map(f => ({
            field: f.alias || f.field,
            aggregation: (f.aggregation || 'sum').toLowerCase() as 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinctCount'
          }))
        });
      } else {
        try {
          const errorData = await response.json();
          // Show detailed error information
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          
          if (errorData.message) {
            errorMessage = errorData.message;
          }
          
          // If there's additional error information, add it
          if (errorData.error) {
            errorMessage += `\n\nDetailed Error: ${errorData.error}`;
          }
          
          // If there's SQL error information, add it
          if (errorData.query) {
            errorMessage += `\n\nQuery: ${errorData.query}`;
          }
          
          console.error('Server error response:', errorData);
          setError(errorMessage);
        } catch (parseErr) {
          // If response is not JSON, show status and text
          const errorText = await response.text();
          const errorMessage = `HTTP ${response.status}: ${response.statusText}${errorText ? `\n\n${errorText}` : ''}`;
          console.error('Non-JSON error response:', errorMessage);
          setError(errorMessage);
        }
      }
    } catch (err: any) {
      console.error('Failed to execute query:', err);
      let errorMessage = 'Failed to execute query';
      
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        errorMessage = 'Network error: Unable to connect to server. Please check your connection and try again.';
      } else if (err.message) {
        errorMessage = `Error: ${err.message}`;
        
        // Add more context for common errors
        if (err.message.includes('JSON')) {
          errorMessage += '\n\nThis may be due to invalid server response format.';
        }
        if (err.message.includes('Unexpected token')) {
          errorMessage += '\n\nThe server returned an invalid response. Check server logs for more details.';
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTables = schema?.tables.filter(t => 
    t.tableName.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (!schema) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500 dark:text-gray-400">Loading database schema...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Query Execution Error
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                <pre className="whitespace-pre-wrap font-mono text-xs bg-red-100 dark:bg-red-900/30 p-2 rounded border overflow-x-auto">
                  {error}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Diagram View */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Database Schema</h3>
        <button
          onClick={() => setShowDiagram(!showDiagram)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {showDiagram ? 'Hide Diagram' : 'Show Diagram'}
        </button>
      </div>

      {showDiagram && (
        <div className="space-y-4">
          {/* Add Table Section */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-700">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Add Tables</h4>
            
            {/* Add Table Dropdown */}
            <div className="flex gap-2 mb-4">
              <select
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                onChange={(e) => {
                  if (e.target.value) {
                    handleBaseTableSelect(e.target.value);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">Select a table to add...</option>
                {filteredTables
                  .filter(table => !selectedTables.includes(table.tableName))
                  .map(table => (
                    <option key={table.tableName} value={table.tableName}>
                      {table.tableName} ({table.fields.length} fields)
                    </option>
                  ))
                }
              </select>
              <input
                type="text"
                placeholder="Search tables..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Selected Tables Grid */}
            {selectedTables.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">Table</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">Type</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">Relationship</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {selectedTables.map((tableName, index) => {
                      const isBaseTable = index === 0 && joins.every(j => j.table !== tableName && j.rightTable !== tableName);
                      const tableJoin = joins.find(j => j.table === tableName || j.rightTable === tableName);
                      const availableRels = availableRelationships[tableName] || [];
                      
                      return (
                        <tr key={tableName} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">{tableName}</span>
                              <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
                                {schema?.tables.find(t => t.tableName === tableName)?.fields.length || 0} fields
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {isBaseTable ? (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                                📊 Base Table (FROM)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                🔗 LEFT JOIN
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isBaseTable ? (
                              <span className="text-sm text-gray-500 dark:text-gray-400">Primary table - no joins needed</span>
                            ) : tableJoin ? (
                              <div className="flex items-center gap-2">
                                <div className="text-sm text-gray-900 dark:text-white">
                                  <div className="font-mono text-xs bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">
                                    {tableJoin.leftTable}.{tableJoin.leftField} → {tableJoin.rightTable}.{tableJoin.rightField}
                                  </div>
                                </div>
                                <select
                                  className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  value={dropdownValues[`change-${tableName}`] || 'current'}
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    if (newValue && newValue !== 'current') {
                                      const rel = availableRels.find(r => r.alias === newValue);
                                      if (rel) {
                                        console.log(`♾️ Changing to: ${rel.relation.fromTable}.${rel.relation.fromField} → ${rel.relation.toTable}.${rel.relation.toField}`);
                                        setJoins(prev => prev.filter(j => !(j.table === tableName || j.rightTable === tableName)));
                                        handleRelationshipSelect(tableName, rel.alias, rel.relation);
                                      }
                                    }
                                    // Reset with unique key for this specific dropdown
                                    setDropdownValues(prev => ({ ...prev, [`change-${tableName}`]: 'current' }));
                                  }}
                                >
                                  <option value="current">Change...</option>
                                  {availableRels
                                    .filter(rel => {
                                      // Don't show current relationship again
                                      const isCurrent = 
                                        rel.relation.fromTable === tableJoin.leftTable && 
                                        rel.relation.fromField === tableJoin.leftField &&
                                        rel.relation.toTable === tableJoin.rightTable && 
                                        rel.relation.toField === tableJoin.rightField;
                                      return !isCurrent;
                                    })
                                    .map((rel, relIndex) => (
                                      <option key={`change-${tableName}-${rel.alias}-${relIndex}`} value={rel.alias}>
                                        {rel.relation.fromTable}.{rel.relation.fromField} → {rel.relation.toTable}.{rel.relation.toField}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            ) : availableRels.length > 0 ? (
                              <select
                                className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                value={dropdownValues[`select-${tableName}`] || ''}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  if (newValue) {
                                    const rel = availableRels.find(r => r.alias === newValue);
                                    if (rel) {
                                      console.log(`🎯 Selected: ${rel.relation.fromTable}.${rel.relation.fromField} → ${rel.relation.toTable}.${rel.relation.toField}`);
                                      handleRelationshipSelect(tableName, rel.alias, rel.relation);
                                    }
                                    // Reset with unique key for this specific dropdown
                                    setDropdownValues(prev => ({ ...prev, [`select-${tableName}`]: '' }));
                                  }
                                }}
                              >
                                <option value="">Choose a relationship...</option>
                                {availableRels.map((rel, relIndex) => (
                                  <option key={`${tableName}-${rel.alias}-${relIndex}`} value={rel.alias}>
                                    {rel.relation.fromTable}.{rel.relation.fromField} → {rel.relation.toTable}.{rel.relation.toField}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-gray-500 dark:text-gray-400">No relationships available</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleBaseTableSelect(tableName)}
                              className="text-red-600 hover:text-red-700 text-sm font-medium"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected Tables and Fields */}
      {selectedTables.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900 dark:text-white">Selected Tables ({selectedTables.length})</h4>
          
          {/* Field Selection */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Rows */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-700">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Rows ({rowFields.length})</h5>
              <div className="space-y-2 mb-3">
                {rowFields.map((field, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-600 rounded">
                    <span className="text-sm text-gray-900 dark:text-white">{field.table}.{field.field}</span>
                    <button
                      onClick={() => handleRemoveField('row', idx)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <select
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                onChange={(e) => {
                  if (e.target.value) {
                    const [table, field] = e.target.value.split('.');
                    handleAddField('row', table, field);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">+ Add Row Field</option>
                {selectedTables.map(tableName => {
                  const table = schema.tables.find(t => t.tableName === tableName);
                  const rels = availableRelationships[tableName] || [];
                  const usedRels = joins.filter(j => j.table === tableName || j.rightTable === tableName);
                  
                  // Determine which relationship context to use
                  let contextLabel = tableName;
                  if (rels.length > 1 && usedRels.length > 0) {
                    // Find the matching relationship by checking exact field matches
                    const usedRel = rels.find(rel => 
                      usedRels.some(j => 
                        j.leftField === rel.relation.fromField && j.rightField === rel.relation.toField &&
                        j.leftTable === rel.relation.fromTable && j.rightTable === rel.relation.toTable
                      )
                    );
                    if (usedRel) {
                      contextLabel = usedRel.description;
                    }
                  } else if (rels.length === 1) {
                    contextLabel = rels[0].description;
                  }
                  
                  return (
                    <optgroup key={tableName} label={`📋 ${contextLabel}`}>
                      {table?.fields.map(f => (
                        <option key={`${tableName}.${f.name}`} value={`${tableName}.${f.name}`}>
                          {f.name} ({f.dataType.split('(')[0]}) {f.comment ? `- ${f.comment.substring(0,30)}...` : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* Columns */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-700">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Columns ({columnFields.length})</h5>
              <div className="space-y-2 mb-3">
                {columnFields.map((field, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-600 rounded">
                    <span className="text-sm text-gray-900 dark:text-white">{field.table}.{field.field}</span>
                    <button
                      onClick={() => handleRemoveField('column', idx)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <select
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                onChange={(e) => {
                  if (e.target.value) {
                    const [table, field] = e.target.value.split('.');
                    handleAddField('column', table, field);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">+ Add Column Field</option>
                {selectedTables.map(tableName => {
                  const table = schema.tables.find(t => t.tableName === tableName);
                  const rels = availableRelationships[tableName] || [];
                  const usedRels = joins.filter(j => j.table === tableName || j.rightTable === tableName);
                  
                  // Determine which relationship context to use
                  let contextLabel = tableName;
                  if (rels.length > 1 && usedRels.length > 0) {
                    const usedRel = rels.find(rel => 
                      usedRels.some(j => 
                        j.leftField === rel.relation.fromField && j.rightField === rel.relation.toField &&
                        j.leftTable === rel.relation.fromTable && j.rightTable === rel.relation.toTable
                      )
                    );
                    if (usedRel) {
                      contextLabel = usedRel.description;
                    }
                  } else if (rels.length === 1) {
                    contextLabel = rels[0].description;
                  }
                  
                  return (
                    <optgroup key={tableName} label={`📊 ${contextLabel}`}>
                      {table?.fields.map(f => (
                        <option key={`${tableName}.${f.name}`} value={`${tableName}.${f.name}`}>
                          {f.name} ({f.dataType.split('(')[0]}) {f.comment ? `- ${f.comment.substring(0,30)}...` : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* Values */}
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-700">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-3">Values ({valueFields.length})</h5>
              <div className="space-y-2 mb-3">
                {valueFields.map((field, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-600 rounded">
                      <span className="text-sm text-gray-900 dark:text-white">{field.table}.{field.field}</span>
                      <button
                        onClick={() => handleRemoveField('value', idx)}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                    <select
                      value={field.aggregation}
                      onChange={(e) => handleUpdateAggregation(idx, e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="SUM">SUM</option>
                      <option value="COUNT">COUNT</option>
                      <option value="AVG">AVG</option>
                      <option value="MIN">MIN</option>
                      <option value="MAX">MAX</option>
                      <option value="DISTINCTCOUNT">DISTINCT COUNT</option>
                    </select>
                  </div>
                ))}
              </div>
              <select
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                onChange={(e) => {
                  if (e.target.value) {
                    const [table, field] = e.target.value.split('.');
                    handleAddField('value', table, field);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">+ Add Value Field (Numeric Only)</option>
                {selectedTables.map(tableName => {
                  const table = schema.tables.find(t => t.tableName === tableName);
                  const rels = availableRelationships[tableName] || [];
                  const usedRels = joins.filter(j => j.table === tableName || j.rightTable === tableName);
                  const numericFields = table?.fields.filter(f => 
                    f.dataType.includes('int') || 
                    f.dataType.includes('decimal') || 
                    f.dataType.includes('float') || 
                    f.dataType.includes('double')
                  ) || [];
                  
                  if (numericFields.length === 0) return null;
                  
                  // Determine which relationship context to use
                  let contextLabel = tableName;
                  if (rels.length > 1 && usedRels.length > 0) {
                    const usedRel = rels.find(rel => 
                      usedRels.some(j => 
                        j.leftField === rel.relation.fromField && j.rightField === rel.relation.toField &&
                        j.leftTable === rel.relation.fromTable && j.rightTable === rel.relation.toTable
                      )
                    );
                    if (usedRel) {
                      contextLabel = usedRel.description;
                    }
                  } else if (rels.length === 1) {
                    contextLabel = rels[0].description;
                  }
                  
                  return (
                    <optgroup key={tableName} label={`🔢 ${contextLabel} (${numericFields.length} numeric fields)`}>
                      {numericFields.map(f => (
                        <option key={`${tableName}.${f.name}`} value={`${tableName}.${f.name}`}>
                          {f.name} ({f.dataType}) {f.comment ? `- ${f.comment.substring(0,25)}...` : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Filters Section */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-semibold text-gray-900 dark:text-white">Filters ({filters.length})</h5>
              <button
                onClick={handleAddFilter}
                className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                + Add Filter
              </button>
            </div>
            
            <div className="space-y-3">
              {filters.map((filter, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 p-3 bg-gray-50 dark:bg-gray-600 rounded border">
                  {/* Table.Field Selection */}
                  <select
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    value={`${filter.table}.${filter.field}`}
                    onChange={(e) => {
                      const [table, field] = e.target.value.split('.');
                      handleUpdateFilter(idx, { table, field });
                    }}
                  >
                    {selectedTables.map(tableName => {
                      const table = schema?.tables.find(t => t.tableName === tableName);
                      return table?.fields.map(f => (
                        <option key={`${tableName}.${f.name}`} value={`${tableName}.${f.name}`}>
                          {tableName}.{f.name} ({f.dataType.split('(')[0]})
                        </option>
                      ));
                    })}
                  </select>

                  {/* Operator Selection */}
                  <select
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    value={filter.operator}
                    onChange={(e) => handleUpdateFilter(idx, { operator: e.target.value as FilterCondition['operator'] })}
                  >
                    <option value="equals">Equals</option>
                    <option value="notEquals">Not Equals</option>
                    <option value="contains">Contains</option>
                    <option value="startsWith">Starts With</option>
                    <option value="endsWith">Ends With</option>
                    <option value="greaterThan">Greater Than</option>
                    <option value="lessThan">Less Than</option>
                    <option value="between">Between</option>
                    <option value="isEmpty">Is Empty</option>
                    <option value="notEmpty">Not Empty</option>
                    <option value="inList">In List</option>
                    <option value="dateRange">Date Range</option>
                  </select>

                  {/* Value Input */}
                  {filter.operator !== 'isEmpty' && filter.operator !== 'notEmpty' && (
                    <input
                      type="text"
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Value..."
                      value={filter.value}
                      onChange={(e) => handleUpdateFilter(idx, { value: e.target.value })}
                    />
                  )}

                  {/* Second Value (for between/dateRange) */}
                  {(filter.operator === 'between' || filter.operator === 'dateRange') && (
                    <input
                      type="text"  
                      className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-500 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="To value..."
                      value={filter.value2 || ''}
                      onChange={(e) => handleUpdateFilter(idx, { value2: e.target.value })}
                    />
                  )}

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveFilter(idx)}
                    className="px-2 py-1 text-sm text-red-600 hover:text-red-700 border border-red-300 hover:border-red-400 rounded transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
              
              {filters.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No filters added. Click "Add Filter" to add conditions to your query.
                </div>
              )}
            </div>
          </div>

          {/* Execute Query Button */}
          <div className="flex justify-end">
            <button
              onClick={handleExecuteQuery}
              disabled={isLoading || (rowFields.length === 0 && columnFields.length === 0 && valueFields.length === 0)}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors font-semibold"
            >
              {isLoading ? 'Executing...' : 'Execute Query'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
