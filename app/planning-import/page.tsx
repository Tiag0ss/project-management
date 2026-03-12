'use client';

import { getApiUrl } from '@/lib/api/config';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';

interface Organization {
  Id: number;
  Name: string;
}

interface ImportCustomer {
  Id: number;
  Name: string;
}

interface ImportProject {
  Id: number;
  ProjectName: string;
  CustomerId?: number | null;
}

interface ImportTask {
  Id: number;
  TaskName: string;
  ProjectId: number;
  ProjectName: string;
}

interface ImportUser {
  Id: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
}

interface FieldMapping {
  customer: string;
  project: string;
  projectId: string;
  task: string;
  taskId: string;
  resource: string;
  resourceId: string;
  allocStart: string;
  allocEnd: string;
  allocHours: string;
  locked: string;
  hlEstimationHours: string;
  comments: string;
}

interface ImportOptionsResponse {
  customers: ImportCustomer[];
  projects: ImportProject[];
  tasks: ImportTask[];
  users: ImportUser[];
}

const JIRA_KEY_REGEX = /\b([A-Z][A-Z0-9]+-\d+)\b/i;

const extractTicketKey = (value: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const jiraMatch = raw.match(JIRA_KEY_REGEX);
  if (jiraMatch?.[1]) return jiraMatch[1].toUpperCase();
  return '';
};

const FIELD_LABELS: Array<{ key: keyof FieldMapping; label: string; required?: boolean }> = [
  { key: 'customer', label: 'Customer → Customers.Name', required: true },
  { key: 'project', label: 'Project → Projects.ProjectName', required: true },
  { key: 'projectId', label: 'Project ID → Projects.Id (optional)' },
  { key: 'task', label: 'Task/Scenario → Tasks.TaskName', required: true },
  { key: 'taskId', label: 'Task ID → Tasks.Id (optional)' },
  { key: 'resource', label: 'Resource → Tasks.AssignedTo (Users.Id)', required: true },
  { key: 'resourceId', label: 'Resource ID → Users.Id (optional)' },
  { key: 'allocStart', label: 'Allocation Start → TaskAllocations.AllocationDate (start)', required: true },
  { key: 'allocEnd', label: 'Allocation End → TaskAllocations.AllocationDate (end)', required: true },
  { key: 'allocHours', label: 'Allocation Hours → TaskAllocations.AllocatedHours', required: true },
  { key: 'locked', label: 'Locked flag (optional)' },
  { key: 'hlEstimationHours', label: 'HL Estimation Hours → Tasks.EstimatedHours' },
  { key: 'comments', label: 'Comments → Tasks.Description / UserVacations.Notes' },
];

const normalize = (value: string) => value.trim().toLowerCase();

const detectDefaultHeader = (headers: string[], key: keyof FieldMapping) => {
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalize(h) }));

  const pick = (candidates: string[]) => {
    for (const candidate of candidates) {
      const match = normalizedHeaders.find((entry) => entry.normalized === candidate || entry.normalized.includes(candidate));
      if (match) return match.original;
    }
    return '';
  };

  if (key === 'customer') return pick(['customer']);
  if (key === 'project') return pick(['project']);
  if (key === 'projectId') return pick(['project id']);
  if (key === 'task') return pick(['scenario', 'task']);
  if (key === 'taskId') return pick(['task id']);
  if (key === 'resource') return pick(['resource', 'assignee']);
  if (key === 'resourceId') return pick(['resource id']);
  if (key === 'allocStart') return pick(['alloc. start', 'allocation start', 'start']);
  if (key === 'allocEnd') return pick(['alloc. end', 'allocation end', 'end']);
  if (key === 'allocHours') return pick(['alloc. hours', 'allocation hours', 'hours']);
  if (key === 'locked') return pick(['locked']);
  if (key === 'hlEstimationHours') return pick(['hl estimation hours', 'estimation hours']);
  if (key === 'comments') return pick(['alloc. comments', 'comments', 'description']);

  return '';
};

const parseCsv = (raw: string): { headers: string[]; rows: Record<string, string>[] } => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    values.push(current.trim());
    return values;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
};

export default function PlanningImportPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [options, setOptions] = useState<ImportOptionsResponse>({ customers: [], projects: [], tasks: [], users: [] });

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    customer: '',
    project: '',
    projectId: '',
    task: '',
    taskId: '',
    resource: '',
    resourceId: '',
    allocStart: '',
    allocEnd: '',
    allocHours: '',
    locked: '',
    hlEstimationHours: '',
    comments: '',
  });

  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [taskMap, setTaskMap] = useState<Record<string, string>>({});
  const [taskTicketNumberMap, setTaskTicketNumberMap] = useState<Record<string, string>>({});
  const [resourceMap, setResourceMap] = useState<Record<string, string>>({});

  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    const loadOrganizations = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${getApiUrl()}/api/organizations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to load organizations');
        const data = await response.json();
        const orgs = data.organizations || [];
        setOrganizations(orgs);
        if (orgs.length === 1) {
          setOrganizationId(Number(orgs[0].Id));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load organizations');
      }
    };

    loadOrganizations();
  }, [token]);

  useEffect(() => {
    const loadOptions = async () => {
      if (!token || !organizationId) return;
      setIsLoadingOptions(true);
      try {
        const response = await fetch(`${getApiUrl()}/api/planning-import/options/${organizationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load import options');
        }
        const data = await response.json();
        setOptions(data.data || { customers: [], projects: [], tasks: [], users: [] });
      } catch (err: any) {
        setError(err.message || 'Failed to load import options');
      } finally {
        setIsLoadingOptions(false);
      }
    };

    loadOptions();
  }, [token, organizationId]);

  const uniqueCustomers = useMemo(() => {
    if (!fieldMapping.customer) return [];
    return Array.from(new Set(rows.map((row) => (row[fieldMapping.customer] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows, fieldMapping.customer]);

  const uniqueProjects = useMemo(() => {
    if (!fieldMapping.project) return [];
    return Array.from(new Set(rows.map((row) => (row[fieldMapping.project] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows, fieldMapping.project]);

  const uniqueResources = useMemo(() => {
    if (!fieldMapping.resource) return [];
    return Array.from(new Set(rows.map((row) => (row[fieldMapping.resource] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows, fieldMapping.resource]);

  const uniqueTaskKeys = useMemo(() => {
    if (!fieldMapping.task || !fieldMapping.project) return [] as string[];
    const keys = new Set<string>();
    rows.forEach((row) => {
      const projectName = (row[fieldMapping.project] || '').trim();
      const taskName = (row[fieldMapping.task] || '').trim();
      if (!projectName || !taskName) return;
      keys.add(`${projectName}||${taskName}`);
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [rows, fieldMapping.task, fieldMapping.project]);

  useEffect(() => {
    if (options.customers.length === 0) return;
    setCustomerMap((prev) => {
      const next = { ...prev };
      uniqueCustomers.forEach((name) => {
        if (next[name]) return;
        const match = options.customers.find((customer) => normalize(customer.Name) === normalize(name));
        next[name] = match ? `existing:${match.Id}` : 'create';
      });
      return next;
    });
  }, [uniqueCustomers, options.customers]);

  useEffect(() => {
    if (options.projects.length === 0) return;
    setProjectMap((prev) => {
      const next = { ...prev };
      uniqueProjects.forEach((name) => {
        if (next[name]) return;
        const match = options.projects.find((project) => normalize(project.ProjectName) === normalize(name));
        next[name] = match ? `existing:${match.Id}` : 'create';
      });
      return next;
    });
  }, [uniqueProjects, options.projects]);

  useEffect(() => {
    if (options.tasks.length === 0) return;
    setTaskMap((prev) => {
      const next = { ...prev };
      uniqueTaskKeys.forEach((key) => {
        if (next[key]) return;
        const [projectName, taskName] = key.split('||');
        const match = options.tasks.find(
          (task) => normalize(task.ProjectName) === normalize(projectName) && normalize(task.TaskName) === normalize(taskName)
        );
        next[key] = match ? `existing:${match.Id}` : 'create';
      });
      return next;
    });
  }, [uniqueTaskKeys, options.tasks]);

  useEffect(() => {
    setTaskTicketNumberMap((prev) => {
      const next = { ...prev };
      uniqueTaskKeys.forEach((key) => {
        if (typeof next[key] === 'string') return;
        const [, taskName] = key.split('||');
        next[key] = extractTicketKey(taskName || '');
      });
      return next;
    });
  }, [uniqueTaskKeys]);

  useEffect(() => {
    setResourceMap((prev) => {
      const next = { ...prev };
      uniqueResources.forEach((name) => {
        if (next[name]) return;
        const match = options.users.find((userOption) => {
          const fullName = `${(userOption.FirstName || '').trim()} ${(userOption.LastName || '').trim()}`.trim();
          return normalize(fullName) === normalize(name) || normalize(userOption.Username || '') === normalize(name);
        });
        next[name] = match ? String(match.Id) : '';
      });
      return next;
    });
  }, [uniqueResources, options.users]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError('');
      setResult(null);
      const text = await file.text();
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);

      const detected: FieldMapping = {
        customer: detectDefaultHeader(parsed.headers, 'customer'),
        project: detectDefaultHeader(parsed.headers, 'project'),
        projectId: detectDefaultHeader(parsed.headers, 'projectId'),
        task: detectDefaultHeader(parsed.headers, 'task'),
        taskId: detectDefaultHeader(parsed.headers, 'taskId'),
        resource: detectDefaultHeader(parsed.headers, 'resource'),
        resourceId: detectDefaultHeader(parsed.headers, 'resourceId'),
        allocStart: detectDefaultHeader(parsed.headers, 'allocStart'),
        allocEnd: detectDefaultHeader(parsed.headers, 'allocEnd'),
        allocHours: detectDefaultHeader(parsed.headers, 'allocHours'),
        locked: detectDefaultHeader(parsed.headers, 'locked'),
        hlEstimationHours: detectDefaultHeader(parsed.headers, 'hlEstimationHours'),
        comments: detectDefaultHeader(parsed.headers, 'comments'),
      };
      setFieldMapping(detected);
    } catch {
      setError('Failed to parse CSV file');
    }
  };

  const canImport = useMemo(() => {
    if (!organizationId || rows.length === 0) return false;

    const requiredMapped = FIELD_LABELS.filter((field) => field.required).every((field) => !!fieldMapping[field.key]);
    if (!requiredMapped) return false;

    const allResourcesMapped = uniqueResources.every((resource) => !!resourceMap[resource]);
    return allResourcesMapped;
  }, [organizationId, rows.length, fieldMapping, uniqueResources, resourceMap]);

  const handleImport = async () => {
    if (!token || !organizationId || !canImport) return;

    setIsImporting(true);
    setError('');
    setResult(null);

    try {
      const payload = {
        organizationId,
        rows,
        fieldMapping,
        taskTicketNumbers: Object.fromEntries(
          Object.entries(taskTicketNumberMap).map(([key, value]) => [key, (value || '').trim()])
        ),
        entityMapping: {
          customers: Object.fromEntries(
            Object.entries(customerMap).map(([source, value]) => {
              if (value.startsWith('existing:')) {
                return [source, { mode: 'existing', targetId: Number(value.split(':')[1]) }];
              }
              return [source, { mode: 'create' }];
            })
          ),
          projects: Object.fromEntries(
            Object.entries(projectMap).map(([source, value]) => {
              if (value === 'ignore') {
                return [source, { mode: 'ignore' }];
              }
              if (value.startsWith('existing:')) {
                return [source, { mode: 'existing', targetId: Number(value.split(':')[1]) }];
              }
              return [source, { mode: 'create' }];
            })
          ),
          tasks: Object.fromEntries(
            Object.entries(taskMap).map(([source, value]) => {
              if (value === 'vacation') {
                return [source, { mode: 'vacation' }];
              }
              if (value.startsWith('existing:')) {
                return [source, { mode: 'existing', targetId: Number(value.split(':')[1]) }];
              }
              return [source, { mode: 'create' }];
            })
          ),
          resources: Object.fromEntries(
            Object.entries(resourceMap).map(([source, value]) => {
              if (value === 'fictional') {
                return [source, { mode: 'fictional' }];
              }
              return [source, { mode: 'existing', userId: value ? Number(value) : null }];
            })
          ),
        },
      };

      const response = await fetch(`${getApiUrl()}/api/planning-import/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Import failed');
      }

      setResult(data.data);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen w-full bg-gray-100 dark:bg-gray-900 p-6">
      <div className="w-full space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Planning CSV Import</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Standalone import page without menu. Use this to map CSV columns and import allocations into one organization.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Organization</label>
              <SearchableSelect
                value={organizationId?.toString() || ''}
                onChange={(value) => setOrganizationId(value ? Number(value) : null)}
                options={organizations.map((organization) => ({ value: organization.Id, label: organization.Name }))}
                placeholder="Organization"
                emptyText="Select organization"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CSV file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {headers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Field Mapping</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {FIELD_LABELS.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {field.label}{field.required ? ' *' : ''}
                  </label>
                  <SearchableSelect
                    value={fieldMapping[field.key]}
                    onChange={(value) => setFieldMapping((prev) => ({ ...prev, [field.key]: value }))}
                    options={headers.map((header) => ({ value: header, label: header }))}
                    placeholder={field.label}
                    emptyText="Not mapped"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {headers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Entity Mapping</h2>
            {isLoadingOptions && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Loading organization options...</p>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Customers</h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded">
                  {uniqueCustomers.map((name) => (
                    <div key={name} className="p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{name}</div>
                      <SearchableSelect
                        value={customerMap[name] || 'create'}
                        onChange={(value) => setCustomerMap((prev) => ({ ...prev, [name]: value }))}
                        options={[
                          { value: 'create', label: 'Create if missing' },
                          ...options.customers.map((customer) => ({ value: `existing:${customer.Id}`, label: customer.Name })),
                        ]}
                        placeholder="Customer mapping"
                        emptyText=""
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Projects</h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded">
                  {uniqueProjects.map((name) => (
                    <div key={name} className="p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{name}</div>
                      <SearchableSelect
                        value={projectMap[name] || 'create'}
                        onChange={(value) => setProjectMap((prev) => ({ ...prev, [name]: value }))}
                        options={[
                          { value: 'ignore', label: 'Ignore rows with this project' },
                          { value: 'create', label: 'Create if missing' },
                          ...options.projects.map((projectOption) => ({ value: `existing:${projectOption.Id}`, label: projectOption.ProjectName })),
                        ]}
                        placeholder="Project mapping"
                        emptyText=""
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Tasks</h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded">
                  {uniqueTaskKeys.map((key) => {
                    const [projectName, taskName] = key.split('||');
                    const ticketNumber = taskTicketNumberMap[key] ?? extractTicketKey(taskName || '');
                    const hasJiraKey = JIRA_KEY_REGEX.test(taskName || '');
                    return (
                      <div key={key} className="p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                          <span>{projectName} → {taskName}</span>
                          {hasJiraKey && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Jira key detected</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={ticketNumber || ''}
                          onChange={(e) => {
                            const normalized = e.target.value
                              .replace(/[^a-zA-Z0-9-]/g, '')
                              .toUpperCase();
                            setTaskTicketNumberMap((prev) => ({ ...prev, [key]: normalized }));
                          }}
                          placeholder="Jira ticket key (e.g. BE1SAMERICAS-7275)"
                          className="w-full mb-2 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <SearchableSelect
                          value={taskMap[key] || 'create'}
                          onChange={(value) => setTaskMap((prev) => ({ ...prev, [key]: value }))}
                          options={[
                            { value: 'vacation', label: 'Create vacation days from this task' },
                            { value: 'create', label: 'Create if missing' },
                            ...options.tasks.map((taskOption) => ({
                              value: `existing:${taskOption.Id}`,
                              label: `${taskOption.ProjectName} → ${taskOption.TaskName}`,
                            })),
                          ]}
                          placeholder="Task mapping"
                          emptyText=""
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Resources (Users)</h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded">
                  {uniqueResources.map((name) => (
                    <div key={name} className="p-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{name}</div>
                      <SearchableSelect
                        value={resourceMap[name] || ''}
                        onChange={(value) => setResourceMap((prev) => ({ ...prev, [name]: value }))}
                        options={[
                          { value: 'fictional', label: 'Create fictitious user' },
                          ...options.users.map((userOption) => {
                            const fullName = `${(userOption.FirstName || '').trim()} ${(userOption.LastName || '').trim()}`.trim();
                            const display = fullName || userOption.Username;
                            return { value: userOption.Id, label: display };
                          }),
                        ]}
                        placeholder="User"
                        emptyText="Select user"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded">
            {error}
          </div>
        )}

        {result && (
          <div className="p-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 text-green-800 dark:text-green-200 rounded">
            <div className="font-semibold mb-2">Import finished</div>
            <div className="text-sm space-y-1">
              <div>Created customers: {result.createdCustomers}</div>
              <div>Created projects: {result.createdProjects}</div>
              <div>Created tasks: {result.createdTasks}</div>
              <div>Created fictitious users: {result.createdFictitiousUsers || 0}</div>
              <div>Created allocations: {result.createdAllocations}</div>
              <div>Created vacation days: {result.createdVacationDays || 0}</div>
              <div>Skipped vacation days: {result.skippedVacationDays || 0}</div>
              <div>Skipped rows: {result.skippedRows || 0}</div>
              <div>Total rows: {result.totalRows}</div>
              <div>Errors: {Array.isArray(result.errors) ? result.errors.length : 0}</div>
            </div>
          </div>
        )}

        {result?.errors?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Row Errors</h3>
            <div className="max-h-56 overflow-auto text-sm text-red-700 dark:text-red-300 space-y-1">
              {result.errors.map((entry: any, idx: number) => (
                <div key={`${entry.row}-${idx}`}>Row {entry.row}: {entry.message}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/planning')}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Back to Planning
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport || isImporting}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded font-medium"
          >
            {isImporting ? 'Importing...' : `Import ${rows.length} Rows`}
          </button>
        </div>
      </div>
    </div>
  );
}
