'use client';

import { getApiUrl } from '@/lib/api/config';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import DynamicQueryBuilder from '@/components/DynamicQueryBuilder';
import * as savedReportsApi from '@/lib/api/savedReports';

interface ReportField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
}

interface PivotConfig {
  rows: string[];
  columns: string[];
  values: ValueConfig[];
}

interface ValueConfig {
  field: string;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinctCount';
}

interface DataSource {
  id: string;
  name: string;
  endpoint: string;
  fields: ReportField[];
}

interface DragState {
  field: string | null;
  sourceType: 'available' | 'rows' | 'columns' | 'values' | null;
}

interface Filter {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'notEquals' | 'greaterThan' | 'lessThan' | 'between' | 'notEmpty' | 'isEmpty' | 'startsWith' | 'endsWith' | 'inList' | 'dateRange';
  value: string;
  value2?: string; // For 'between' and 'dateRange' operators
  valueList?: string[]; // For 'inList' operator
}

interface SavedReport {
  Id: number;
  DataSource: string;
  ReportName: string;
  PivotConfig: PivotConfig;
  Filters: Filter[];
  CreatedAt: string;
  UpdatedAt: string;
  SharedWith?: string; // JSON array of user IDs
  IsPublic?: number; // 0 or 1
}

interface ModalState {
  type: 'save' | 'edit' | 'delete' | 'drillDown' | 'share' | 'chart' | 'print' | null;
  reportId?: number;
  reportName?: string;
  drillDownData?: any[];
  drillDownTitle?: string;
}

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

export default function WebReportsPage() {
  const { user, token, isLoading } = useAuth();
  const [dataSource, setDataSource] = useState<string>('');
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ type: null });
  const [reportNameInput, setReportNameInput] = useState('');
  const [rawData, setRawData] = useState<any[]>([]);
  const [pivotConfig, setPivotConfig] = useState<PivotConfig>({
    rows: [],
    columns: [],
    values: []
  });
  const [pivotData, setPivotData] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [dragState, setDragState] = useState<DragState>({
    field: null,
    sourceType: null
  });
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showGrandTotals, setShowGrandTotals] = useState(true);
  const [conditionalFormatting, setConditionalFormatting] = useState<{
    enabled: boolean;
    threshold: number;
    colorLow: string;
    colorHigh: string;
  }>({ enabled: false, threshold: 0, colorLow: '#ef4444', colorHigh: '#22c55e' });
  const [viewMode, setViewMode] = useState<'table' | 'bar' | 'line'>('table');
  const [selectedShareUsers, setSelectedShareUsers] = useState<number[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [dynamicFields, setDynamicFields] = useState<ReportField[]>([]); // For dynamic data source
  const [printLayout, setPrintLayout] = useState<'horizontal' | 'vertical' | null>(null);

  const dataSources: DataSource[] = [
    {
      id: 'time-entries',
      name: 'Time Entries',
      endpoint: '/api/time-entries/my-entries',
      fields: [
        { key: 'WorkDate', label: 'Work Date', type: 'date' },
        { key: 'Hours', label: 'Hours', type: 'number' },
        { key: 'TaskName', label: 'Task Name', type: 'text' },
        { key: 'ProjectName', label: 'Project Name', type: 'text' },
        { key: 'Description', label: 'Description', type: 'text' },
        { key: 'StartTime', label: 'Start Time', type: 'text' },
        { key: 'EndTime', label: 'End Time', type: 'text' },
      ]
    },
    {
      id: 'tasks',
      name: 'Tasks',
      endpoint: '/api/tasks/my-tasks',
      fields: [
        { key: 'TaskName', label: 'Task Name', type: 'text' },
        { key: 'ProjectName', label: 'Project Name', type: 'text' },
        { key: 'StatusName', label: 'Status', type: 'text' },
        { key: 'PriorityName', label: 'Priority', type: 'text' },
        { key: 'EstimatedHours', label: 'Estimated Hours', type: 'number' },
        { key: 'PlannedStartDate', label: 'Planned Start', type: 'date' },
        { key: 'PlannedEndDate', label: 'Planned End', type: 'date' },
        { key: 'AssigneeName', label: 'Assigned To', type: 'text' },
        { key: 'CreatorName', label: 'Created By', type: 'text' },
        { key: 'DependsOnTaskName', label: 'Depends On', type: 'text' },
        { key: 'Description', label: 'Description', type: 'text' },
        { key: 'SubtaskCount', label: 'Subtasks Count', type: 'number' },
        { key: 'IsHobby', label: 'Is Hobby Project', type: 'number' },
      ]
    },
    {
      id: 'projects',
      name: 'Projects',
      endpoint: '/api/projects',
      fields: [
        { key: 'ProjectName', label: 'Project Name', type: 'text' },
        { key: 'StatusName', label: 'Status', type: 'text' },
        { key: 'StartDate', label: 'Start Date', type: 'date' },
        { key: 'EndDate', label: 'End Date', type: 'date' },
        { key: 'OrganizationName', label: 'Organization', type: 'text' },
        { key: 'CustomerName', label: 'Customer', type: 'text' },
        { key: 'CreatorName', label: 'Created By', type: 'text' },
        { key: 'Description', label: 'Description', type: 'text' },
        { key: 'TotalTasks', label: 'Total Tasks', type: 'number' },
        { key: 'CompletedTasks', label: 'Completed Tasks', type: 'number' },
        { key: 'TotalEstimatedHours', label: 'Estimated Hours', type: 'number' },
        { key: 'TotalWorkedHours', label: 'Worked Hours', type: 'number' },
        { key: 'OpenTickets', label: 'Open Tickets', type: 'number' },
        { key: 'UnplannedTasks', label: 'Unplanned Tasks', type: 'number' },
      ]
    },
    {
      id: 'task-allocations',
      name: 'Task Allocations',
      endpoint: '/api/task-allocations/my-allocations',
      fields: [
        { key: 'AllocationDate', label: 'Allocation Date', type: 'date' },
        { key: 'AllocatedHours', label: 'Allocated Hours', type: 'number' },
        { key: 'TaskName', label: 'Task Name', type: 'text' },
        { key: 'ProjectName', label: 'Project Name', type: 'text' },
        { key: 'StartTime', label: 'Start Time', type: 'text' },
        { key: 'EndTime', label: 'End Time', type: 'text' },
      ]
    },
    {
      id: 'tickets',
      name: 'Tickets',
      endpoint: '/api/tickets',
      fields: [
        { key: 'Title', label: 'Title', type: 'text' },
        { key: 'StatusName', label: 'Status', type: 'text' },
        { key: 'PriorityName', label: 'Priority', type: 'text' },
        { key: 'TypeName', label: 'Type', type: 'text' },
        { key: 'ProjectName', label: 'Project', type: 'text' },
        { key: 'CustomerName', label: 'Customer', type: 'text' },
        { key: 'AssigneeName', label: 'Assigned To', type: 'text' },
        { key: 'CreatorName', label: 'Created By', type: 'text' },
        { key: 'CreatedAt', label: 'Created Date', type: 'date' },
        { key: 'ResolvedAt', label: 'Resolved Date', type: 'date' },
        { key: 'EstimatedHours', label: 'Estimated Hours', type: 'number' },
        { key: 'Description', label: 'Description', type: 'text' },
      ]
    },
    {
      id: 'dynamic',
      name: 'Dynamic Query Builder',
      endpoint: '/api/dynamic-reports/query',
      fields: [] // Fields will be dynamically determined by user
    }
  ];

  // Get current source with dynamic fields support
  const getCurrentSource = () => {
    const source = dataSources.find(ds => ds.id === dataSource);
    if (source && dataSource === 'dynamic' && dynamicFields.length > 0) {
      return { ...source, fields: dynamicFields };
    }
    return source;
  };

  const currentSource = getCurrentSource();

  useEffect(() => {
    if (dataSource && token) {
      loadData();
      loadSavedReports();
    }
  }, [dataSource, token]);

  useEffect(() => {
    if (rawData.length > 0) {
      applyFilters();
    } else {
      setFilteredData([]);
    }
  }, [rawData, filters]);

  useEffect(() => {
    if (filteredData.length > 0 && (pivotConfig.rows.length > 0 || pivotConfig.columns.length > 0)) {
      generatePivotTable();
    } else {
      setPivotData(null);
    }
  }, [filteredData, pivotConfig, expandedRows]);

  // Load all users for sharing functionality
  useEffect(() => {
    const loadUsers = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${getApiUrl()}/api/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setAllUsers(data.users || []);
        }
      } catch (err) {
        console.error('Failed to load users:', err);
      }
    };
    loadUsers();
  }, [token]);

  const loadData = async () => {
    setIsLoadingData(true);
    setError('');
    try {
      const source = dataSources.find(ds => ds.id === dataSource);
      if (!source) return;

      // Skip loading for dynamic data source (will be loaded via DynamicQueryBuilder)
      if (dataSource === 'dynamic') {
        setIsLoadingData(false);
        return;
      }

      const response = await fetch(`${getApiUrl()}${source.endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Handle different response structures
        let records = data.entries || data.tasks || data.projects || data.allocations || data.tickets || data.data || [];
        
        // Normalize fields
        if (records.length > 0) {
          const numberFields = source.fields.filter(f => f.type === 'number').map(f => f.key);
          const dateFields = source.fields.filter(f => f.type === 'date').map(f => f.key);
          
          records = records.map((record: any) => {
            const normalized = { ...record };
            
            // Normalize number fields - convert null/undefined to 0
            numberFields.forEach(field => {
              if (normalized[field] === null || normalized[field] === undefined || normalized[field] === 'N/A') {
                normalized[field] = 0;
              }
            });
            
            // Normalize date fields - convert to YYYY-MM-DD format
            dateFields.forEach(field => {
              if (normalized[field]) {
                const strValue = String(normalized[field]);
                // If it's an ISO timestamp, extract just the date part
                if (strValue.includes('T')) {
                  normalized[field] = strValue.split('T')[0];
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
                  // Already in correct format
                  normalized[field] = strValue;
                } else {
                  // Try to parse and format
                  const date = new Date(normalized[field]);
                  if (!isNaN(date.getTime())) {
                    normalized[field] = date.toISOString().split('T')[0];
                  }
                }
              }
            });
            
            return normalized;
          });
        }
        
        console.log('Loaded records:', records.length, 'from', dataSource);
        setRawData(records);
      } else {
        setError('Failed to load data');
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load data');
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadSavedReports = async () => {
    if (!dataSource || !token) return;
    
    try {
      const result = await savedReportsApi.getSavedReportsByDataSource(token, dataSource);
      if (result.success) {
        setSavedReports(result.reports);
      }
    } catch (err) {
      console.error('Failed to load saved reports:', err);
    }
  };

  const applyFilters = () => {
    // First, normalize date fields in raw data
    const dateFieldKeys = currentSource?.fields.filter(f => f.type === 'date').map(f => f.key) || [];
    const normalizedRawData = rawData.map(record => {
      const normalized = { ...record };
      dateFieldKeys.forEach(field => {
        if (normalized[field]) {
          const strValue = String(normalized[field]);
          // Extract just YYYY-MM-DD from any date format
          if (strValue.includes('T')) {
            normalized[field] = strValue.split('T')[0];
          }
        }
      });
      return normalized;
    });
    
    if (filters.length === 0) {
      setFilteredData(normalizedRawData);
      return;
    }

    const filtered = normalizedRawData.filter(record => {
      return filters.every(filter => {
        const rawValue = record[filter.field];
        const field = currentSource?.fields.find(f => f.key === filter.field);
        const fieldType = field?.type || 'text';
        
        // For numeric fields, work with numbers directly
        if (fieldType === 'number') {
          const numericValue = rawValue === null || rawValue === undefined ? 0 : Number(rawValue);
          const filterNumValue = Number(filter.value);
          const filterNumValue2 = filter.value2 ? Number(filter.value2) : 0;
          
          switch (filter.operator) {
            case 'equals':
              return numericValue === filterNumValue;
            case 'notEquals':
              return numericValue !== filterNumValue;
            case 'greaterThan':
              return numericValue > filterNumValue;
            case 'lessThan':
              return numericValue < filterNumValue;
            case 'between':
              return numericValue >= filterNumValue && numericValue <= filterNumValue2;
            case 'notEmpty':
              return rawValue !== null && rawValue !== undefined;
            case 'isEmpty':
              return rawValue === null || rawValue === undefined;
            default:
              return true;
          }
        }
        
        // For text and date fields, use string comparison
        const fieldValue = String(rawValue || '').toLowerCase();
        const filterValue = filter.value.toLowerCase();
        const filterValue2 = filter.value2?.toLowerCase() || '';

        switch (filter.operator) {
          case 'equals':
            return fieldValue === filterValue;
          case 'notEquals':
            return fieldValue !== filterValue;
          case 'contains':
            return fieldValue.includes(filterValue);
          case 'startsWith':
            return fieldValue.startsWith(filterValue);
          case 'endsWith':
            return fieldValue.endsWith(filterValue);
          case 'inList':
            if (!filter.valueList || filter.valueList.length === 0) return true;
            const listValues = filter.valueList.map(v => v.toLowerCase());
            return listValues.includes(fieldValue);
          case 'dateRange':
            const dateValue = new Date(rawValue);
            const startDate = new Date(filter.value);
            const endDate = new Date(filter.value2 || filter.value);
            return dateValue >= startDate && dateValue <= endDate;
          case 'notEmpty':
            return fieldValue !== '' && fieldValue !== 'null' && fieldValue !== 'undefined';
          case 'isEmpty':
            return fieldValue === '' || fieldValue === 'null' || fieldValue === 'undefined';
          default:
            return true;
        }
      });
    });

    setFilteredData(filtered);
  };

  // Helper function to determine if a field is a date type
  const isDateField = (fieldKey: string): boolean => {
    const field = currentSource?.fields.find(f => f.key === fieldKey);
    return field?.type === 'date';
  };

  // Helper function to format date value to YYYY-MM-DD
  const formatDateValue = (value: any): string => {
    if (!value || value === 'N/A') return 'N/A';
    
    // Convert to string first
    const strValue = String(value);
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
      return strValue;
    }
    
    // If it's an ISO timestamp string, extract just the date part
    if (/^\d{4}-\d{2}-\d{2}T/.test(strValue)) {
      return strValue.split('T')[0];
    }
    
    // Try to parse as date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    
    return strValue;
  };

  // Helper function to format date for display (user-friendly)
  const formatDateForDisplay = (value: any): string => {
    if (!value || value === 'N/A') return 'N/A';
    
    // Try to parse as date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      // Format as YYYY-MM-DD for users
      return date.toISOString().split('T')[0];
    }
    
    return String(value);
  };

  // Helper function to format field labels for headers
  const formatFieldLabel = (fieldKey: string, aggregation?: string): string => {
    const field = currentSource?.fields.find(f => f.key === fieldKey);
    let label = field?.label || fieldKey;
    
    // Simplify aggregation labels
    if (aggregation) {
      const aggMap: {[key: string]: string} = {
        'sum': 'Total',
        'count': 'Contagem',
        'avg': 'Média',
        'min': 'Mín',
        'max': 'Máx',
        'distinctCount': 'Únicos'
      };
      const aggLabel = aggMap[aggregation.toLowerCase()] || aggregation;
      label = `${aggLabel} ${label}`;
    }
    
    return label;
  };

  // Helper function to sort column values (handles dates properly)
  const sortColumnValues = (values: string[], columnFields: string[]): string[] => {
    // Check if any of the column fields are date types
    const hasDateField = columnFields.some(field => isDateField(field));
    
    if (!hasDateField) {
      // No date fields, use regular sort
      return [...values].sort();
    }
    
    // Sort with date awareness
    return [...values].sort((a, b) => {
      // Split multi-field values
      const aParts = a.split(' | ');
      const bParts = b.split(' | ');
      
      for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
        const fieldKey = columnFields[i];
        const aVal = aParts[i];
        const bVal = bParts[i];
        
        if (isDateField(fieldKey)) {
          // Format as dates for comparison
          const aDate = formatDateValue(aVal);
          const bDate = formatDateValue(bVal);
          
          if (aDate !== bDate) {
            return aDate.localeCompare(bDate);
          }
        } else {
          // Regular string comparison
          if (aVal !== bVal) {
            return aVal.localeCompare(bVal);
          }
        }
      }
      
      return 0;
    });
  };

  const generatePivotTable = () => {
    if (filteredData.length === 0) {
      setPivotData(null);
      return;
    }

    const { rows, columns, values } = pivotConfig;

    if (rows.length === 0) {
      setPivotData(null);
      return;
    }

    // CRITICAL: Normalize ALL date fields in filteredData before ANY processing
    const dateFieldKeys = currentSource?.fields.filter(f => f.type === 'date').map(f => f.key) || [];
    const normalizedData = filteredData.map(record => {
      const normalized = { ...record };
      dateFieldKeys.forEach(field => {
        if (normalized[field]) {
          let strValue = String(normalized[field]);
          // Strip everything after 'T' to get just YYYY-MM-DD
          if (strValue.includes('T')) {
            strValue = strValue.split('T')[0];
          }
          normalized[field] = strValue;
        }
      });
      return normalized;
    });

    // Build hierarchical structure when multiple row fields
    const buildHierarchy = (data: any[], level: number = 0): any => {
      if (level >= rows.length) {
        return data;
      }

      const grouped: { [key: string]: any[] } = {};
      data.forEach(record => {
        const rawValue = record[rows[level]] || 'N/A';
        // Data is already normalized, just use string conversion
        const key = String(rawValue);
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(record);
      });

      const result: any = {};
      Object.keys(grouped).sort().forEach(key => {
        result[key] = {
          data: grouped[key],
          children: level < rows.length - 1 ? buildHierarchy(grouped[key], level + 1) : null,
          displayKey: key
        };
      });

      return result;
    };

    // Build column keys - each column value × each value field
    let columnKeys: string[] = [];
    if (columns.length > 0 && values.length > 0) {
      // Get unique column values (data is already normalized)
      const rawColumnValues = [...new Set(normalizedData.map(r => 
        columns.map(c => String(r[c] || 'N/A')).join(' | ')
      ))];
      
      // Sort column values
      const columnValues = rawColumnValues.sort();
      
      // Create column key for each combination of column value × value field
      columnKeys = columnValues.flatMap(colVal => 
        values.map((v: ValueConfig) => `${colVal}|||${v.field}|||${v.aggregation}`)
      );
    } else if (values.length > 0) {
      // No column grouping, just one column per value field
      columnKeys = values.map((v: ValueConfig) => `Total|||${v.field}|||${v.aggregation}`);
    } else {
      // No values, just show total count
      columnKeys = ['Total'];
    }

    console.log('Column keys:', columnKeys);
    console.log('Rows config:', rows);
    console.log('Columns config:', columns);
    console.log('Values config:', values);

    // Build pivot with hierarchy using normalized data
    const hierarchy = buildHierarchy(normalizedData);
    
    // Calculate aggregated values for a specific column key
    const calculateValues = (records: any[], colKey: string): number => {
      // Parse column key: "colValue|||field|||aggregation"
      const [colValue, field, aggregation] = colKey.split('|||');
      
      let relevantRecords = records;
      
      // If we have columns configured, filter by column value
      if (columns.length > 0 && colValue !== 'Total') {
        relevantRecords = records.filter(r => {
          const recordColKey = columns.map(c => String(r[c] || 'N/A')).join(' | ');
          return recordColKey === colValue;
        });
      }

      if (relevantRecords.length === 0) return 0;
      
      // If no field specified (legacy Total), just count
      if (!field || field === 'undefined') {
        return relevantRecords.length;
      }

      const vals = relevantRecords.map(r => parseFloat(r[field]) || 0);

      switch (aggregation) {
        case 'sum':
          return vals.reduce((sum, v) => sum + v, 0);
        case 'count':
          return relevantRecords.length;
        case 'distinctCount':
          const uniqueVals = new Set(relevantRecords.map(r => r[field]));
          return uniqueVals.size;
        case 'avg':
          return vals.length > 0 ? vals.reduce((sum, v) => sum + v, 0) / vals.length : 0;
        case 'min':
          return vals.length > 0 ? Math.min(...vals) : 0;
        case 'max':
          return vals.length > 0 ? Math.max(...vals) : 0;
        default:
          return 0;
      }
    };

    const flattenHierarchy = (node: any, prefix: string = '', level: number = 0): any[] => {
      const result: any[] = [];
      
      Object.keys(node).forEach(key => {
        const fullKey = prefix ? `${prefix}|${key}` : key;
        const item = node[key];
        
        const row: any = {
          key: fullKey,
          displayKey: item.displayKey || key, // Use pre-formatted display key
          level,
          hasChildren: item.children !== null && Object.keys(item.children).length > 0,
          data: {}
        };

        columnKeys.forEach(colKey => {
          row.data[colKey] = calculateValues(item.data, colKey);
        });

        // Store raw records for drill-down
        row.rawRecords = item.data;

        result.push(row);

        // Add children if expanded AND has children
        if (item.children && expandedRows.has(fullKey)) {
          result.push(...flattenHierarchy(item.children, fullKey, level + 1));
        }
      });

      return result;
    };

    const flatData = flattenHierarchy(hierarchy);
    setPivotData({ rows: flatData, columns: columnKeys });
  };

  const handleAddField = (type: 'rows' | 'columns' | 'values', field: string) => {
    if (type === 'values') {
      setPivotConfig(prev => ({
        ...prev,
        values: [...prev.values, { field, aggregation: 'sum' }]
      }));
    } else {
      setPivotConfig(prev => ({
        ...prev,
        [type]: [...prev[type], field]
      }));
    }
  };

  const handleRemoveField = (type: 'rows' | 'columns' | 'values', index: number) => {
    setPivotConfig(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  const handleUpdateValueAggregation = (index: number, aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinctCount') => {
    setPivotConfig(prev => ({
      ...prev,
      values: prev.values.map((v, i) => i === index ? { ...v, aggregation } : v)
    }));
  };

  const handleDragStart = (field: string, sourceType: 'available' | 'rows' | 'columns' | 'values') => {
    setDragState({ field, sourceType });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetType: 'rows' | 'columns' | 'values') => {
    if (!dragState.field) return;

    // Remove from source if it's not 'available'
    if (dragState.sourceType && dragState.sourceType !== 'available') {
      const sourceType = dragState.sourceType as 'rows' | 'columns' | 'values';
      setPivotConfig(prev => {
        const updated = { ...prev };
        if (sourceType === 'values') {
          updated.values = prev.values.filter((v: ValueConfig) => v.field !== dragState.field);
        } else {
          updated[sourceType] = prev[sourceType].filter((f: string) => f !== dragState.field);
        }
        return updated;
      });
    }

    // Add to target if not already there
    if (targetType === 'values') {
      setPivotConfig(prev => {
        if (!prev.values.find((v: ValueConfig) => v.field === dragState.field!)) {
          const updated = { ...prev };
          updated.values = [...prev.values, { field: dragState.field!, aggregation: 'sum' }];
          return updated;
        }
        return prev;
      });
    } else {
      setPivotConfig(prev => {
        if (!prev[targetType].includes(dragState.field!)) {
          const updated = { ...prev };
          updated[targetType] = [...prev[targetType], dragState.field!];
          return updated;
        }
        return prev;
      });
    }

    setDragState({ field: null, sourceType: null });
  };

  const handleDragEnd = () => {
    setDragState({ field: null, sourceType: null });
  };

  const handleClearAll = () => {
    setPivotConfig({
      rows: [],
      columns: [],
      values: []
    });
    setPivotData(null);
  };

  const handleAddFilter = () => {
    if (!currentSource || currentSource.fields.length === 0) return;
    
    const newFilter: Filter = {
      id: Date.now().toString(),
      field: currentSource.fields[0].key,
      operator: 'equals',
      value: ''
    };
    setFilters([...filters, newFilter]);
  };

  const handleUpdateFilter = (id: string, updates: Partial<Filter>) => {
    setFilters(filters.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleRemoveFilter = (id: string) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const handleClearFilters = () => {
    setFilters([]);
  };

  const toggleRowExpand = (rowKey: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowKey)) {
      newExpanded.delete(rowKey);
    } else {
      newExpanded.add(rowKey);
    }
    setExpandedRows(newExpanded);
  };

  const expandAll = () => {
    if (!pivotData) return;
    const allKeys = new Set<string>();
    pivotData.rows.forEach((row: any) => {
      if (row.hasChildren) {
        allKeys.add(row.key);
      }
    });
    setExpandedRows(allKeys);
  };

  const collapseAll = () => {
    setExpandedRows(new Set());
  };

  const handlePrint = (layout: 'horizontal' | 'vertical') => {
    if (!pivotData) return;

    const { rows: pivotRows, columns: cols } = pivotData;

    // Create printable HTML
    let printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pivot Table Report - ${new Date().toLocaleDateString()}</title>
        <style>
          @page {
            size: ${layout === 'horizontal' ? 'landscape' : 'portrait'};
            margin: 1cm;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: ${layout === 'horizontal' ? '9pt' : '10pt'};
            margin: 0;
            padding: 20px;
          }
          h1 {
            font-size: 18pt;
            margin-bottom: 10px;
            color: #333;
          }
          .meta {
            font-size: 9pt;
            color: #666;
            margin-bottom: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: ${layout === 'horizontal' ? '4px 6px' : '6px 8px'};
            text-align: left;
          }
          th {
            background-color: #f5f5f5;
            font-weight: bold;
            position: sticky;
            top: 0;
          }
          .indent-1 { padding-left: 20px; }
          .indent-2 { padding-left: 40px; }
          .indent-3 { padding-left: 60px; }
          .numeric {
            text-align: right;
          }
          .total-row {
            font-weight: bold;
            background-color: #f9f9f9;
          }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>📊 Pivot Table Report</h1>
        <div class="meta">
          <div>Data Source: ${currentSource?.name || dataSource}</div>
          <div>Generated: ${new Date().toLocaleString()}</div>
          <div>Layout: ${layout === 'horizontal' ? 'Horizontal (Landscape)' : 'Vertical (Portrait)'}</div>
          <div>Records: ${filteredData.length}</div>
        </div>
        <table>
          <thead>
            <tr>`;

    // Build headers
    pivotConfig.rows.forEach(r => {
      const field = currentSource?.fields.find(f => f.key === r);
      printContent += `<th>${field?.label || r}</th>`;
    });

    cols.forEach((col: string) => {
      const [colValue] = col.split('|||');
      printContent += `<th class="numeric">${colValue}</th>`;
    });

    printContent += `<th class="numeric">Total</th></tr></thead><tbody>`;

    // Build rows
    pivotRows.forEach((row: any) => {
      printContent += `<tr class="${row.level === 0 ? 'total-row' : ''}">`;
      
      // Row headers with indentation
      const keys = row.key.split('|');
      pivotConfig.rows.forEach((_, idx) => {
        if (idx <= row.level) {
          printContent += `<td class="indent-${row.level}">${keys[idx] || ''}</td>`;
        } else {
          printContent += `<td></td>`;
        }
      });

      // Values
      cols.forEach((colKey: string) => {
        const value = row.data[colKey] || 0;
        printContent += `<td class="numeric">${typeof value === 'number' ? value.toFixed(2) : value}</td>`;
      });

      // Row total
      const rowTotal = cols.reduce((sum: number, col: string) => sum + (row.data[col] || 0), 0);
      printContent += `<td class="numeric total-row">${rowTotal.toFixed(2)}</td>`;
      
      printContent += `</tr>`;
    });

    printContent += `</tbody></table></body></html>`;

    // Open in new window and print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      
      // Wait for content to load, then print
      printWindow.onload = () => {
        printWindow.print();
      };
    }

    // Close modal
    setModalState({ type: null });
    setPrintLayout(null);
  };

  const exportToCSV = () => {
    if (!pivotData) return;

    const { rows: pivotRows, columns: cols } = pivotData;

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build header - one column per row field
    const rowHeaders = pivotConfig.rows.map(r => {
      const field = currentSource?.fields.find(f => f.key === r);
      return escapeCSV(field?.label || r);
    });

    // Build value column headers
    const valueHeaders = cols.map((col: string) => {
      const [colValue, field, aggregation] = col.split('|||');
      const fieldLabel = currentSource?.fields.find(f => f.key === field)?.label || field;
      const aggLabel = aggregation ? ` (${aggregation})` : '';
      const header = field && field !== 'undefined' 
        ? `${colValue}${colValue !== 'Total' ? ' | ' : ''}${fieldLabel}${aggLabel}`
        : colValue;
      return escapeCSV(header);
    });

    // Build CSV header row
    let csv = [...rowHeaders, ...valueHeaders, 'Total'].join(',') + '\n';

    // Build data rows - need to track the full hierarchy path
    const buildRowData = (row: any): string[] => {
      // Parse the full key to get all hierarchy values
      const keys = row.key.split('|');
      
      // Create array with values for each row field
      const rowValues = new Array(pivotConfig.rows.length).fill('');
      
      // Fill in the values we have (up to current level)
      for (let i = 0; i <= row.level && i < keys.length; i++) {
        rowValues[i] = keys[i];
      }
      
      return rowValues.map(v => escapeCSV(v));
    };

    // Add data rows
    pivotRows.forEach((row: any) => {
      const rowTotal = cols.reduce((sum: number, col: string) => sum + (row.data[col] || 0), 0);
      
      const rowFields = buildRowData(row);
      const valueFields = cols.map((colKey: string) => (row.data[colKey] || 0).toFixed(2));
      
      csv += [...rowFields, ...valueFields, rowTotal.toFixed(2)].join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pivot-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveReport = async () => {
    if (!reportNameInput.trim()) {
      setError('Please enter a report name');
      return;
    }

    try {
      if (modalState.type === 'save') {
        const result = await savedReportsApi.createSavedReport(token!, {
          dataSource,
          reportName: reportNameInput,
          pivotConfig,
          filters
        });

        if (result.success) {
          await loadSavedReports();
          setModalState({ type: null });
          setReportNameInput('');
          setError('');
        } else {
          setError(result.message || 'Failed to save report');
        }
      } else if (modalState.type === 'edit' && modalState.reportId) {
        const result = await savedReportsApi.updateSavedReport(token!, modalState.reportId, {
          reportName: reportNameInput,
          pivotConfig,
          filters
        });

        if (result.success) {
          await loadSavedReports();
          setModalState({ type: null });
          setReportNameInput('');
          setError('');
        } else {
          setError(result.message || 'Failed to update report');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    try {
      const result = await savedReportsApi.deleteSavedReport(token!, reportId);
      if (result.success) {
        await loadSavedReports();
        setModalState({ type: null });
      } else {
        setError(result.message || 'Failed to delete report');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleLoadReport = (report: SavedReport) => {
    setPivotConfig(report.PivotConfig);
    setFilters(report.Filters || []);
    setExpandedRows(new Set());
  };

  const handleOpenSaveModal = () => {
    setReportNameInput('');
    setModalState({ type: 'save' });
    setError('');
  };

  const handleOpenEditModal = (report: SavedReport) => {
    setReportNameInput(report.ReportName);
    setModalState({ type: 'edit', reportId: report.Id, reportName: report.ReportName });
    setError('');
  };

  const handleOpenDeleteModal = (report: SavedReport) => {
    setModalState({ type: 'delete', reportId: report.Id, reportName: report.ReportName });
  };

  const handleOpenShareModal = (report: SavedReport) => {
    const existingUserIds = report.SharedWith 
      ? report.SharedWith.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      : [];
    setSelectedShareUsers(existingUserIds);
    setUserSearchTerm('');
    setModalState({ type: 'share', reportId: report.Id, reportName: report.ReportName });
    setError('');
  };

  const handleShareReport = async () => {
    if (!modalState.reportId) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/saved-reports/${modalState.reportId}/share`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userIds: selectedShareUsers.map(String) }),
      });

      if (response.ok) {
        await loadSavedReports();
        setModalState({ type: null });
        setSelectedShareUsers([]);
        setUserSearchTerm('');
      } else {
        setError('Failed to share report');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleTogglePublic = async (reportId: number, currentStatus: number) => {
    try {
      const newStatus = currentStatus === 1 ? 0 : 1;
      console.log('Toggling public status:', { reportId, currentStatus, newStatus });
      
      const response = await fetch(`${getApiUrl()}/api/saved-reports/${reportId}/toggle-public`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isPublic: newStatus }),
      });

      if (response.ok) {
        console.log('Toggle successful, reloading reports...');
        await loadSavedReports();
      } else {
        const errorData = await response.json();
        console.error('Toggle failed:', errorData);
        setError('Failed to toggle public status');
      }
    } catch (err: any) {
      console.error('Toggle error:', err);
      setError(err.message || 'An error occurred');
    }
  };

  const handleDrillDown = (row: any, colKey: string) => {
    // Parse column key to filter records
    const [colValue, field, aggregation] = colKey.split('|||');
    
    let records = row.rawRecords || [];
    
    // Filter by column value if applicable
    if (pivotConfig.columns.length > 0 && colValue !== 'Total') {
      records = records.filter((r: any) => {
        const recordColKey = pivotConfig.columns.map(c => r[c] || 'N/A').join(' | ');
        return recordColKey === colValue;
      });
    }
    
    const title = `${row.displayKey} - ${colValue !== 'Total' ? colValue : 'All'}`;
    setModalState({ type: 'drillDown', drillDownData: records, drillDownTitle: title });
  };

  const getCellColor = (value: number): string => {
    if (!conditionalFormatting.enabled) return '';
    
    const { threshold, colorLow, colorHigh } = conditionalFormatting;
    
    if (value < threshold) {
      const intensity = Math.min(100, Math.abs((threshold - value) / threshold) * 100);
      return `${colorLow}${Math.round(intensity * 2.55).toString(16).padStart(2, '0')}`;
    } else {
      const intensity = Math.min(100, ((value - threshold) / threshold) * 50);
      return `${colorHigh}${Math.round(intensity * 2.55).toString(16).padStart(2, '0')}`;
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <CustomerUserGuard>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />

        <main className="max-w-[1920px] mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            {/* Page Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg shadow p-6 text-white mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold">📊 Web Reports</h1>
                  <p className="text-purple-100 mt-1">Dynamic pivot table reporting</p>
                </div>
                <div className="text-5xl opacity-80">📈</div>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                {error}
              </div>
            )}

            {/* Configuration Panel */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Report Configuration
                </h2>

                {/* Data Source Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data Source
                  </label>
                  <select
                    value={dataSource}
                    onChange={(e) => {
                      setDataSource(e.target.value);
                      handleClearAll();
                    }}
                    className="w-full md:w-96 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Select a data source...</option>
                    {dataSources.map(ds => (
                      <option key={ds.id} value={ds.id}>{ds.name}</option>
                    ))}
                  </select>
                  {isLoadingData && (
                    <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">Loading data...</p>
                  )}
                  {rawData.length > 0 && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {rawData.length} records loaded
                      {filters.length > 0 && ` • ${filteredData.length} after filters`}
                    </p>
                  )}
                </div>

                {/* Dynamic Query Builder */}
                {dataSource === 'dynamic' && token && (
                  <DynamicQueryBuilder 
                    token={token}
                    onDataLoaded={(data, fields, dynamicPivotConfig) => {
                      // Normalize date fields in dynamic query data
                      const dateFields = fields.filter(f => f.type === 'date').map(f => f.key);
                      const normalizedData = data.map((record: any) => {
                        const normalized = { ...record };
                        dateFields.forEach(field => {
                          if (normalized[field]) {
                            const strValue = String(normalized[field]);
                            // If it's an ISO timestamp, extract just the date part
                            if (strValue.includes('T')) {
                              normalized[field] = strValue.split('T')[0];
                            } else if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
                              // Already in correct format
                              normalized[field] = strValue;
                            } else {
                              // Try to parse and format
                              const date = new Date(normalized[field]);
                              if (!isNaN(date.getTime())) {
                                normalized[field] = date.toISOString().split('T')[0];
                              }
                            }
                          }
                        });
                        return normalized;
                      });
                      
                      setRawData(normalizedData);
                      setDynamicFields(fields);
                      
                      // Use the exact configuration from the dynamic query builder
                      setPivotConfig({
                        rows: dynamicPivotConfig.rows,
                        columns: dynamicPivotConfig.columns,
                        values: dynamicPivotConfig.values as ValueConfig[]
                      });
                      
                      // Update currentSource to use dynamic fields
                      const dynamicSource = dataSources.find(ds => ds.id === 'dynamic');
                      if (dynamicSource) {
                        dynamicSource.fields = fields;
                      }
                    }}
                  />
                )}

                {/* Show filters and pivot configuration for regular datasources OR dynamic after query execution */}
                {((currentSource && rawData.length > 0 && dataSource !== 'dynamic') || 
                  (dataSource === 'dynamic' && rawData.length > 0 && dynamicFields.length > 0)) && (
                  <>
                    {/* Saved Reports Section */}
                    {savedReports.length > 0 && (
                      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                          <span className="mr-2">💾</span>
                          Saved Reports ({savedReports.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {savedReports.map(report => (
                            <div 
                              key={report.Id}
                              className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600 hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <button
                                    onClick={() => handleLoadReport(report)}
                                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline text-left truncate block w-full"
                                    title={report.ReportName}
                                  >
                                    {report.ReportName}
                                  </button>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Updated: {new Date(report.UpdatedAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="flex gap-1 ml-2">
                                  <button
                                    onClick={() => handleOpenEditModal(report)}
                                    className="p-1 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                                    title="Edit report"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleOpenShareModal(report)}
                                    className="p-1 text-gray-600 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400"
                                    title="Share report"
                                  >
                                    🔗
                                  </button>
                                  <button
                                    onClick={() => handleTogglePublic(report.Id, report.IsPublic || 0)}
                                    className={`p-1 ${report.IsPublic === 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-600'} hover:text-yellow-600 dark:hover:text-yellow-400`}
                                    title={report.IsPublic === 1 ? 'Make private' : 'Make public'}
                                  >
                                    {report.IsPublic === 1 ? '🌐' : '🔒'}
                                  </button>
                                  <button
                                    onClick={() => handleOpenDeleteModal(report)}
                                    className="p-1 text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                                    title="Delete report"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Filters Section */}
                    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 dark:text-white">🔍 Filters</h3>
                        <div className="flex gap-2">
                          <button
                            onClick={handleAddFilter}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                          >
                            + Add Filter
                          </button>
                          {filters.length > 0 && (
                            <button
                              onClick={handleClearFilters}
                              className="px-3 py-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-sm rounded transition-colors"
                            >
                              Clear All
                            </button>
                          )}
                        </div>
                      </div>

                      {filters.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-3">
                          No filters applied. Click "Add Filter" to filter your data.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {filters.map((filter, idx) => {
                            const field = currentSource?.fields.find(f => f.key === filter.field);
                            const fieldType = field?.type || 'text';

                            return (
                              <div key={filter.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600">
                                <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[30px]">
                                  {idx === 0 ? 'Where' : 'And'}
                                </span>
                                
                                {/* Field Selection */}
                                <select
                                  value={filter.field}
                                  onChange={(e) => handleUpdateFilter(filter.id, { field: e.target.value })}
                                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  {currentSource?.fields.map((f, idx) => (
                                    <option key={`${f.key}-${idx}`} value={f.key}>{f.label}</option>
                                  ))}
                                </select>

                                {/* Operator Selection */}
                                <select
                                  value={filter.operator}
                                  onChange={(e) => handleUpdateFilter(filter.id, { operator: e.target.value as any })}
                                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  <option value="equals">Equals</option>
                                  <option value="notEquals">Not Equals</option>
                                  <option value="contains">Contains</option>
                                  <option value="startsWith">Starts With</option>
                                  <option value="endsWith">Ends With</option>
                                  {fieldType === 'number' && (
                                    <>
                                      <option value="greaterThan">Greater Than</option>
                                      <option value="lessThan">Less Than</option>
                                      <option value="between">Between</option>
                                    </>
                                  )}
                                  {fieldType === 'date' && (
                                    <option value="dateRange">Date Range</option>
                                  )}
                                  <option value="inList">In List</option>
                                  <option value="notEmpty">Not Empty</option>
                                  <option value="isEmpty">Is Empty</option>
                                </select>

                                {/* Value Input(s) */}
                                {filter.operator !== 'notEmpty' && filter.operator !== 'isEmpty' && (
                                  <>
                                    {filter.operator === 'inList' ? (
                                      <textarea
                                        value={filter.valueList?.join('\n') || ''}
                                        onChange={(e) => handleUpdateFilter(filter.id, { 
                                          valueList: e.target.value.split('\n').map(v => v.trim()).filter(v => v) 
                                        })}
                                        placeholder="Enter values (one per line)"
                                        rows={3}
                                        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                                      />
                                    ) : (
                                      <>
                                        <input
                                          type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                                          value={filter.value}
                                          onChange={(e) => handleUpdateFilter(filter.id, { value: e.target.value })}
                                          placeholder="Value"
                                          className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        {(filter.operator === 'between' || filter.operator === 'dateRange') && (
                                          <>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">and</span>
                                            <input
                                              type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                                              value={filter.value2 || ''}
                                              onChange={(e) => handleUpdateFilter(filter.id, { value2: e.target.value })}
                                              placeholder="Value 2"
                                              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                          </>
                                        )}
                                      </>
                                    )}
                                  </>
                                )}

                                {/* Remove Button */}
                                <button
                                  onClick={() => handleRemoveFilter(filter.id)}
                                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 ml-2"
                                  title="Remove filter"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {/* Drag & Drop Areas - Only show for non-dynamic data sources */}
                    {dataSource !== 'dynamic' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      {/* Rows */}
                      <div 
                        className="border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-4 min-h-[120px] transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/10"
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('rows')}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900 dark:text-white">📋 Rows</h3>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Group by</span>
                        </div>
                        <div className="space-y-2">
                          {pivotConfig.rows.map((field, idx) => (
                            <div 
                              key={idx} 
                              draggable
                              onDragStart={() => handleDragStart(field, 'rows')}
                              onDragEnd={handleDragEnd}
                              className="flex items-center justify-between bg-blue-100 dark:bg-blue-900/30 px-3 py-2 rounded cursor-move hover:bg-blue-200 dark:hover:bg-blue-900/50"
                            >
                              <span className="text-sm text-gray-900 dark:text-white">
                                {currentSource?.fields.find(f => f.key === field)?.label || field}
                              </span>
                              <button
                                onClick={() => handleRemoveField('rows', idx)}
                                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 ml-2"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {pivotConfig.rows.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">
                              Drag fields here
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Columns */}
                      <div 
                        className="border-2 border-dashed border-green-300 dark:border-green-700 rounded-lg p-4 min-h-[120px] transition-colors hover:bg-green-50 dark:hover:bg-green-900/10"
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('columns')}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900 dark:text-white">📊 Columns</h3>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Split by</span>
                        </div>
                        <div className="space-y-2">
                          {pivotConfig.columns.map((field, idx) => (
                            <div 
                              key={idx} 
                              draggable
                              onDragStart={() => handleDragStart(field, 'columns')}
                              onDragEnd={handleDragEnd}
                              className="flex items-center justify-between bg-green-100 dark:bg-green-900/30 px-3 py-2 rounded cursor-move hover:bg-green-200 dark:hover:bg-green-900/50"
                            >
                              <span className="text-sm text-gray-900 dark:text-white">
                                {currentSource?.fields.find(f => f.key === field)?.label || field}
                              </span>
                              <button
                                onClick={() => handleRemoveField('columns', idx)}
                                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 ml-2"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {pivotConfig.columns.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">
                              Drag fields here
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Values */}
                      <div 
                        className="border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg p-4 min-h-[120px] transition-colors hover:bg-purple-50 dark:hover:bg-purple-900/10"
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop('values')}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900 dark:text-white">🔢 Values</h3>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Aggregate</span>
                        </div>
                        <div className="space-y-2">
                          {pivotConfig.values.map((valueConfig: ValueConfig, idx: number) => (
                            <div 
                              key={idx} 
                              draggable
                              onDragStart={() => handleDragStart(valueConfig.field, 'values')}
                              onDragEnd={handleDragEnd}
                              className="flex items-center justify-between gap-2 bg-purple-100 dark:bg-purple-900/30 px-3 py-2 rounded cursor-move hover:bg-purple-200 dark:hover:bg-purple-900/50"
                            >
                              <span className="text-sm text-gray-900 dark:text-white flex-1">
                                {currentSource?.fields.find(f => f.key === valueConfig.field)?.label || valueConfig.field}
                              </span>
                              <select
                                value={valueConfig.aggregation}
                                onChange={(e) => handleUpdateValueAggregation(idx, e.target.value as any)}
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-1 text-xs border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                              >
                                <option value="sum">Sum</option>
                                <option value="count">Count</option>
                                <option value="distinctCount">Distinct Count</option>
                                <option value="avg">Average</option>
                                <option value="min">Min</option>
                                <option value="max">Max</option>
                              </select>
                              <button
                                onClick={() => handleRemoveField('values', idx)}
                                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 ml-1"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {pivotConfig.values.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">
                              Drag numeric fields here
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Available Fields - Only show for non-dynamic data sources */}
                    {dataSource !== 'dynamic' && (
                      <div className="mb-6">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                          Available Fields - Drag to Rows, Columns, or Values
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {(currentSource?.fields || []).map(field => {
                            const isUsed = pivotConfig.rows.includes(field.key) || 
                                          pivotConfig.columns.includes(field.key) || 
                                          pivotConfig.values.some((v: ValueConfig) => v.field === field.key);
                            
                            return (
                              <div 
                                key={field.key}
                                draggable
                                onDragStart={() => handleDragStart(field.key, 'available')}
                                onDragEnd={handleDragEnd}
                                className={`px-3 py-2 rounded-lg text-sm border cursor-move transition-all ${
                                  isUsed 
                                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 border-gray-400 dark:border-gray-500 opacity-50'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 hover:shadow-md'
                                }`}
                                title={isUsed ? 'Already in use' : `Drag to add ${field.label}`}
                              >
                                <span className="mr-2">
                                  {field.type === 'number' ? '🔢' : field.type === 'date' ? '📅' : '📝'}
                                </span>
                                {field.label}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 flex-wrap">
                      <button
                        onClick={handleClearAll}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Clear All
                      </button>
                      <button
                        onClick={() => setShowGrandTotals(!showGrandTotals)}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          showGrandTotals 
                            ? 'bg-green-600 hover:bg-green-700 text-white' 
                            : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {showGrandTotals ? '✓ Show Totals' : '✗ Hide Totals'}
                      </button>
                      <button
                        onClick={() => setConditionalFormatting({
                          ...conditionalFormatting,
                          enabled: !conditionalFormatting.enabled
                        })}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          conditionalFormatting.enabled 
                            ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                            : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {conditionalFormatting.enabled ? '🎨 Formatting On' : '🎨 Formatting Off'}
                      </button>
                      {(pivotConfig.rows.length > 0 || pivotConfig.columns.length > 0 || pivotConfig.values.length > 0) && (
                        <button
                          onClick={handleOpenSaveModal}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                          💾 Save Report
                        </button>
                      )}
                      {pivotData && (
                        <>
                          <button
                            onClick={exportToCSV}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                          >
                            📥 Export to CSV
                          </button>
                          <button
                            onClick={() => setModalState({ type: 'print' })}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                          >
                            🖨️ Print
                          </button>
                          <div className="flex gap-2 border-l border-gray-300 dark:border-gray-600 pl-3">
                            <button
                              onClick={() => setViewMode('table')}
                              className={`px-3 py-2 rounded-lg transition-colors ${
                                viewMode === 'table' 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                              title="Table view"
                            >
                              📊
                            </button>
                            <button
                              onClick={() => setViewMode('bar')}
                              className={`px-3 py-2 rounded-lg transition-colors ${
                                viewMode === 'bar' 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                              title="Bar chart"
                            >
                              📊
                            </button>
                            <button
                              onClick={() => setViewMode('line')}
                              className={`px-3 py-2 rounded-lg transition-colors ${
                                viewMode === 'line' 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              }`}
                              title="Line chart"
                            >
                              📈
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Save/Edit Report Modal */}
            {(modalState.type === 'save' || modalState.type === 'edit') && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    {modalState.type === 'save' ? '💾 Save Report' : '✏️ Edit Report'}
                  </h3>
                  
                  {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
                      {error}
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Report Name
                    </label>
                    <input
                      type="text"
                      value={reportNameInput}
                      onChange={(e) => setReportNameInput(e.target.value)}
                      placeholder="Enter report name..."
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      autoFocus
                    />
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <p className="mb-1">
                      <strong>Data Source:</strong> {currentSource?.name}
                    </p>
                    <p className="mb-1">
                      <strong>Rows:</strong> {pivotConfig.rows.length > 0 ? pivotConfig.rows.map(r => currentSource?.fields.find(f => f.key === r)?.label).join(', ') : 'None'}
                    </p>
                    <p className="mb-1">
                      <strong>Columns:</strong> {pivotConfig.columns.length > 0 ? pivotConfig.columns.map(c => currentSource?.fields.find(f => f.key === c)?.label).join(', ') : 'None'}
                    </p>
                    <p>
                      <strong>Values:</strong> {pivotConfig.values.length > 0 ? pivotConfig.values.map((v: ValueConfig) => `${currentSource?.fields.find(f => f.key === v.field)?.label} (${v.aggregation})`).join(', ') : 'None'}
                    </p>
                  </div>

                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => {
                        setModalState({ type: null });
                        setReportNameInput('');
                        setError('');
                      }}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveReport}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      {modalState.type === 'save' ? 'Save' : 'Update'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {modalState.type === 'delete' && modalState.reportId && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    🗑️ Delete Report
                  </h3>
                  
                  <p className="text-gray-700 dark:text-gray-300 mb-6">
                    Are you sure you want to delete the report <strong>"{modalState.reportName}"</strong>? This action cannot be undone.
                  </p>

                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setModalState({ type: null })}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteReport(modalState.reportId!)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Print Layout Selection Modal */}
            {modalState.type === 'print' && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    🖨️ Print Pivot Table
                  </h3>
                  
                  <p className="text-gray-700 dark:text-gray-300 mb-6">
                    Select the page orientation for printing:
                  </p>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                      onClick={() => handlePrint('vertical')}
                      className="p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
                    >
                      <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📄</div>
                      <div className="font-semibold text-gray-900 dark:text-white">Vertical</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Portrait</div>
                    </button>
                    
                    <button
                      onClick={() => handlePrint('horizontal')}
                      className="p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
                    >
                      <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📃</div>
                      <div className="font-semibold text-gray-900 dark:text-white">Horizontal</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Landscape</div>
                    </button>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setModalState({ type: null })}
                      className="px-4 py-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Share Report Modal */}
            {modalState.type === 'share' && modalState.reportId && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                    🔗 Share Report
                  </h3>
                  
                  {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
                      {error}
                    </div>
                  )}

                  {/* Search and Add Users */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Add Users
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        placeholder="Search users..."
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      {userSearchTerm && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {allUsers
                            .filter(u => 
                              !selectedShareUsers.includes(u.Id) &&
                              (`${u.FirstName} ${u.LastName}`.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                               u.Email.toLowerCase().includes(userSearchTerm.toLowerCase()))
                            )
                            .map(u => (
                              <button
                                key={u.Id}
                                onClick={() => {
                                  setSelectedShareUsers([...selectedShareUsers, u.Id]);
                                  setUserSearchTerm('');
                                }}
                                className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                              >
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {u.FirstName} {u.LastName}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {u.Email}
                                </div>
                              </button>
                            ))}
                          {allUsers.filter(u => 
                            !selectedShareUsers.includes(u.Id) &&
                            (`${u.FirstName} ${u.LastName}`.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                             u.Email.toLowerCase().includes(userSearchTerm.toLowerCase()))
                          ).length === 0 && (
                            <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                              No users found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected Users */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Shared with ({selectedShareUsers.length})
                    </label>
                    {selectedShareUsers.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No users selected. Report is private.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedShareUsers.map(userId => {
                          const user = allUsers.find(u => u.Id === userId);
                          if (!user) return null;
                          return (
                            <div
                              key={userId}
                              className="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                            >
                              <span>{user.FirstName} {user.LastName}</span>
                              <button
                                onClick={() => setSelectedShareUsers(selectedShareUsers.filter(id => id !== userId))}
                                className="hover:text-red-600 dark:hover:text-red-400"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => {
                        setModalState({ type: null });
                        setSelectedShareUsers([]);
                        setUserSearchTerm('');
                        setError('');
                      }}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleShareReport}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      Share
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Drill-Down Modal */}
            {modalState.type === 'drillDown' && modalState.drillDownData && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      🔍 {modalState.drillDownTitle || 'Record Details'}
                    </h3>
                    <button
                      onClick={() => setModalState({ type: null })}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-auto p-6">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Showing {modalState.drillDownData.length} record(s)
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full border border-gray-300 dark:border-gray-600">
                        <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                          <tr>
                            {Object.keys(modalState.drillDownData[0] || {}).map(key => (
                              <th 
                                key={key}
                                className="px-4 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap"
                              >
                                {currentSource?.fields.find(f => f.key === key)?.label || key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {modalState.drillDownData.map((record, idx) => (
                            <tr 
                              key={idx}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            >
                              {Object.entries(record).map(([key, value]) => (
                                <td 
                                  key={key}
                                  className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap"
                                >
                                  {value !== null && value !== undefined ? String(value) : '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button
                      onClick={() => setModalState({ type: null })}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pivot Table Display */}
            {pivotData && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {viewMode === 'table' ? 'Pivot Table Results' : viewMode === 'bar' ? 'Bar Chart' : 'Line Chart'}
                    </h2>
                    {pivotConfig.rows.length > 1 && (
                      <div className="flex gap-2">
                        <button
                          onClick={expandAll}
                          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                        >
                          Expand All
                        </button>
                        <button
                          onClick={collapseAll}
                          className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
                        >
                          Collapse All
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {viewMode === 'table' ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-700">
                            {pivotConfig.rows.map(r => currentSource?.fields.find(f => f.key === r)?.label).join(' / ')}
                          </th>
                          {pivotData.columns.map((col: string) => {
                            // Parse column key: "colValue|||field|||aggregation"
                            const [colValue, field, aggregation] = col.split('|||');
                            
                            const displayHeader = field && field !== 'undefined' 
                              ? `${colValue} | ${formatFieldLabel(field, aggregation)}`
                              : colValue;
                            
                            return (
                              <th key={col} className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                {displayHeader}
                              </th>
                            );
                          })}
                          {showGrandTotals && (
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/30">
                              Total
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {pivotData.rows.map((row: any, idx: number) => {
                          const rowTotal = pivotData.columns.reduce((sum: number, col: string) => sum + (row.data[col] || 0), 0);
                          const isExpanded = expandedRows.has(row.key);

                          return (
                            <tr key={row.key} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${row.level > 0 ? 'bg-gray-50/50 dark:bg-gray-700/50' : ''}`}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800">
                                <div className="flex items-center" style={{ paddingLeft: `${row.level * 24}px` }}>
                                  {row.hasChildren && (
                                    <button
                                      onClick={() => toggleRowExpand(row.key)}
                                      className="mr-2 w-5 h-5 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                                    >
                                      {isExpanded ? '−' : '+'}
                                    </button>
                                  )}
                                  <span className={row.level === 0 ? 'font-bold' : ''}>
                                    {row.displayKey}
                                  </span>
                                </div>
                              </td>
                              {pivotData.columns.map((col: string) => {
                                const cellValue = row.data[col] || 0;
                                const bgColor = conditionalFormatting.enabled ? getCellColor(cellValue) : '';
                                
                                return (
                                  <td 
                                    key={col} 
                                    className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                                    style={bgColor ? { backgroundColor: bgColor } : {}}
                                    onClick={() => handleDrillDown(row, col)}
                                    title="Click to view records"
                                  >
                                    {cellValue.toFixed(2)}
                                  </td>
                                );
                              })}
                              {showGrandTotals && (
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30">
                                  {rowTotal.toFixed(2)}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {showGrandTotals && (
                          <tr className="bg-gray-50 dark:bg-gray-700 font-bold">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white sticky left-0 bg-gray-50 dark:bg-gray-700">
                              Grand Total
                            </td>
                            {pivotData.columns.map((col: string) => {
                              const colTotal = pivotData.rows
                                .filter((r: any) => r.level === 0)
                                .reduce((sum: number, row: any) => sum + (row.data[col] || 0), 0);
                              return (
                                <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                                  {colTotal.toFixed(2)}
                                </td>
                              );
                            })}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50">
                              {pivotData.rows
                                .filter((r: any) => r.level === 0)
                                .reduce((total: number, row: any) => {
                                  return total + pivotData.columns.reduce((sum: number, col: string) => sum + (row.data[col] || 0), 0);
                                }, 0).toFixed(2)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  ) : viewMode === 'bar' ? (
                    <div className="p-4">
                      <svg width="100%" height="400" className="bg-white dark:bg-gray-800">
                        {pivotData.rows.filter((r: any) => r.level === 0).map((row: any, idx: number) => {
                          const maxValue = Math.max(...pivotData.rows.map((r: any) => 
                            pivotData.columns.reduce((sum: number, col: string) => sum + (r.data[col] || 0), 0)
                          ));
                          const rowTotal = pivotData.columns.reduce((sum: number, col: string) => sum + (row.data[col] || 0), 0);
                          const barHeight = (rowTotal / maxValue) * 300;
                          const barWidth = 60;
                          const spacing = 80;
                          const x = 100 + idx * spacing;
                          const y = 350 - barHeight;
                          
                          return (
                            <g key={row.key}>
                              <rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                fill="#3b82f6"
                                className="hover:opacity-80 cursor-pointer"
                              />
                              <text
                                x={x + barWidth / 2}
                                y={y - 5}
                                textAnchor="middle"
                                className="text-xs fill-gray-900 dark:fill-gray-100"
                              >
                                {rowTotal.toFixed(0)}
                              </text>
                              <text
                                x={x + barWidth / 2}
                                y={370}
                                textAnchor="middle"
                                className="text-xs fill-gray-700 dark:fill-gray-300"
                                transform={`rotate(-45 ${x + barWidth / 2} 370)`}
                              >
                                {row.displayKey.substring(0, 10)}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  ) : (
                    <div className="p-4">
                      <svg width="100%" height="400" className="bg-white dark:bg-gray-800" viewBox="0 0 800 400">
                        <defs>
                          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {(() => {
                          const levelZeroRows = pivotData.rows.filter((r: any) => r.level === 0);
                          const maxValue = Math.max(...levelZeroRows.map((r: any) => 
                            pivotData.columns.reduce((sum: number, col: string) => sum + (r.data[col] || 0), 0)
                          ));
                          const points: ChartPoint[] = levelZeroRows.map((row: any, idx: number) => {
                            const rowTotal = pivotData.columns.reduce((sum: number, col: string) => sum + (row.data[col] || 0), 0);
                            const x = 100 + (idx / (levelZeroRows.length - 1 || 1)) * 600;
                            const y = 350 - (rowTotal / maxValue) * 300;
                            return { x, y, value: rowTotal, label: row.displayKey };
                          });
                          
                          const pathData = points.map((p: ChartPoint, i: number) => 
                            `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
                          ).join(' ');
                          
                          const areaData = `${pathData} L ${points[points.length - 1].x} 350 L ${points[0].x} 350 Z`;
                          
                          return (
                            <>
                              <path d={areaData} fill="url(#lineGradient)" />
                              <path d={pathData} stroke="#3b82f6" strokeWidth="3" fill="none" />
                              {points.map((p: ChartPoint, i: number) => (
                                <g key={i}>
                                  <circle cx={p.x} cy={p.y} r="5" fill="#3b82f6" className="hover:r-7 cursor-pointer" />
                                  <text x={p.x} y={p.y - 15} textAnchor="middle" className="text-xs fill-gray-900 dark:fill-gray-100">
                                    {p.value.toFixed(0)}
                                  </text>
                                  <text x={p.x} y={370} textAnchor="middle" className="text-xs fill-gray-700 dark:fill-gray-300">
                                    {p.label.substring(0, 8)}
                                  </text>
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!dataSource && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Select a Data Source
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Choose a data source above to start building your pivot table report
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </CustomerUserGuard>
  );
}
