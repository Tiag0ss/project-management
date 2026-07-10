/** Cache key builders — values are without the global REDIS_KEY_PREFIX. */

const keyPart = (value: number | string | string[]): string => {
  const normalized = Array.isArray(value) ? value[0] : value;
  return String(normalized);
};

export const cacheKeys = {
  authToken: (tokenHash: string) => `auth:token:${tokenHash}`,
  settingsGlobal: () => 'settings:global',
  settingsPublic: () => 'settings:public',
  settingsUserFlags: () => 'settings:user-flags',

  userOrganizations: (userId: number) => `user:${userId}:organizations`,
  org: (orgId: number | string | string[]) => `org:${keyPart(orgId)}`,
  orgMembers: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:members`,
  orgUsers: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:users`,
  orgAvailableUsers: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:available-users`,
  orgCustomers: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:customers`,
  orgApplications: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:applications`,
  orgProjects: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:projects`,
  orgTickets: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:tickets`,
  orgTags: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:tags`,
  orgCustomFields: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:custom-fields`,
  orgStatusValues: (orgId: number | string | string[], type: string) => `org:${keyPart(orgId)}:status-values:${type}`,
  orgMemos: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:memos`,
  orgSla: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:sla`,
  orgWorkflow: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:workflow`,
  orgPermissionGroups: (orgId: number | string | string[]) => `org:${keyPart(orgId)}:permission-groups`,

  customer: (customerId: number | string | string[]) => `customer:${keyPart(customerId)}`,
  customerProjects: (customerId: number | string | string[]) => `customer:${keyPart(customerId)}:projects`,
  customerOverview: (customerId: number | string | string[]) => `customer:${keyPart(customerId)}:overview`,

  application: (applicationId: number | string | string[]) => `application:${keyPart(applicationId)}`,
  applicationVersions: (applicationId: number | string | string[]) => `application:${keyPart(applicationId)}:versions`,
  applicationTasks: (applicationId: number | string | string[]) => `application:${keyPart(applicationId)}:tasks`,

  project: (projectId: number | string | string[]) => `project:${keyPart(projectId)}`,
  projectPermissions: (projectId: number | string | string[]) => `project:${keyPart(projectId)}:permissions`,
  projectTasks: (projectId: number | string | string[]) => `project:${keyPart(projectId)}:tasks`,
  projectTasksSummary: (projectId: number | string | string[]) => `project:${keyPart(projectId)}:tasks-summary`,
  projectSprints: (projectId: number | string | string[]) => `project:${keyPart(projectId)}:sprints`,
  projectMilestones: (projectId: number | string | string[]) => `project:${keyPart(projectId)}:milestones`,
  projectBurndown: (projectId: number | string | string[]) => `project:${keyPart(projectId)}:burndown`,
  projectFlowMetrics: (projectId: number | string | string[]) => `project:${keyPart(projectId)}:flow-metrics`,

  task: (taskId: number | string | string[]) => `task:${keyPart(taskId)}`,
  userMyTasks: (userId: number) => `user:${userId}:my-tasks`,
  ticket: (ticketId: number | string | string[]) => `ticket:${keyPart(ticketId)}`,
  userMyTickets: (userId: number) => `user:${userId}:my-tickets`,
  ticketsStats: (orgId: number | string | string[]) => `tickets:stats:${keyPart(orgId)}`,

  userPerms: (userId: number, orgId: number | string) => `user:${userId}:perms:${orgId}`,
  userEmailQueue: (userId: number) => `user:${userId}:email-queue`,
  userGridPref: (userId: number, gridKey: string) => `user:${userId}:grid:${gridKey}`,

  usersList: () => 'users:list',

  planningOrg: (orgId: number | string) => `planning:org:${orgId}`,
  allocationsList: (scope: string) => `allocations:${scope}`,
  timeEntriesPlanning: (scope: string) => `time-entries:planning:${scope}`,
  holidays: (scope: string) => `holidays:${scope}`,
  vacations: (scope: string) => `vacations:${scope}`,
  ooo: (scope: string) => `ooo:${scope}`,
  devSupport: (scope: string) => `devSupport:${scope}`,
  callRecords: (scope: string) => `call-records:${scope}`,
  recurringAllocations: (scope: string) => `recurring:${scope}`,
  childAllocations: (parentId: number | string) => `child-allocations:parent:${parentId}`,

  kpi: (scope: string) => `kpi:${scope}`,
  stats: (scope: string) => `stats:${scope}`,
  search: (hash: string) => `search:${hash}`,
  portalOverview: (scope: string) => `portal:${scope}`,
  activityStats: (scope: string) => `activity:stats:${scope}`,
};

export const ENTITY_TTL_SECONDS = 300;
export const AGGREGATE_TTL_SECONDS = 60;
export const AUTH_TOKEN_TTL_SECONDS = 120;
