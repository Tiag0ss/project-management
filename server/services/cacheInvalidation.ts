import { cache } from './cache';
import { cacheKeys } from './cacheKeys';

const normalizeId = (value?: number | string | string[]): number | string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized;
};

/** Delete exact cache key and scoped variants (key:suffix). */
export const delKeyFamily = async (key: string): Promise<void> => {
  await cache.del(key);
  await cache.delByPrefix(`${key}:`);
};

export type CacheEntityType =
  | 'authToken'
  | 'settings'
  | 'organization'
  | 'customer'
  | 'application'
  | 'project'
  | 'task'
  | 'ticket'
  | 'allocation'
  | 'timeEntry'
  | 'tag'
  | 'statusValue'
  | 'permission'
  | 'permissionGroup'
  | 'customField'
  | 'workflow'
  | 'sla'
  | 'memo'
  | 'emailQueue'
  | 'gridPreference'
  | 'sprint'
  | 'milestone'
  | 'holiday'
  | 'vacation'
  | 'ooo'
  | 'callRecord'
  | 'recurringAllocation'
  | 'childAllocation'
  | 'user'
  | 'kpi'
  | 'stats'
  | 'search'
  | 'portal';

export interface InvalidatePayload {
  orgId?: number | string | string[];
  projectId?: number | string | string[];
  customerId?: number | string | string[];
  applicationId?: number | string | string[];
  taskId?: number | string | string[];
  ticketId?: number | string | string[];
  userId?: number;
  userIds?: number[];
  tokenHash?: string;
  gridKey?: string;
  statusType?: string;
  parentAllocationId?: number | string;
}

const invalidatePlanning = async (orgId?: number | string): Promise<void> => {
  if (orgId !== undefined) {
    await cache.delByPrefix(cacheKeys.planningOrg(orgId));
  }
};

const invalidateKpiAndStats = async (orgId?: number | string, projectId?: number | string): Promise<void> => {
  if (orgId !== undefined) {
    await cache.delByPrefix(`kpi:${orgId}`);
    await cache.delByPrefix(`stats:${orgId}`);
    await delKeyFamily(cacheKeys.ticketsStats(orgId));
  }
  if (projectId !== undefined) {
    await cache.del(cacheKeys.projectBurndown(projectId));
    await cache.del(cacheKeys.projectFlowMetrics(projectId));
    await cache.delByPrefix(`kpi:project:${projectId}`);
    await cache.delByPrefix(`stats:project:${projectId}`);
  }
  await cache.delByPrefix('search:');
};

export async function invalidateAuthTokenCaches(tokenHash: string): Promise<void> {
  await cache.del(cacheKeys.authToken(tokenHash));
}

export async function invalidateSettingsCaches(): Promise<void> {
  await cache.del(cacheKeys.settingsGlobal());
  await cache.del(cacheKeys.settingsPublic());
  await cache.del(cacheKeys.settingsUserFlags());
}

export async function invalidateOrganizationCaches(payload: InvalidatePayload): Promise<void> {
  const { orgId, userIds, userId } = payload;
  const normalizedOrgId = normalizeId(orgId);
  if (normalizedOrgId !== undefined) {
    await cache.del(cacheKeys.org(normalizedOrgId));
    await cache.del(cacheKeys.orgMembers(normalizedOrgId));
    await cache.del(cacheKeys.orgUsers(normalizedOrgId));
    await cache.del(cacheKeys.orgAvailableUsers(normalizedOrgId));
    await cache.del(cacheKeys.orgCustomers(normalizedOrgId));
    await cache.del(cacheKeys.orgApplications(normalizedOrgId));
    await cache.del(cacheKeys.orgProjects(normalizedOrgId));
    await delKeyFamily(cacheKeys.orgTickets(normalizedOrgId));
    await delKeyFamily(cacheKeys.orgTags(normalizedOrgId));
    await cache.del(cacheKeys.orgCustomFields(normalizedOrgId));
    await cache.del(cacheKeys.orgMemos(normalizedOrgId));
    await cache.del(cacheKeys.orgSla(normalizedOrgId));
    await cache.del(cacheKeys.orgWorkflow(normalizedOrgId));
    await cache.del(cacheKeys.orgPermissionGroups(normalizedOrgId));
    await cache.delByPrefix(`org:${normalizedOrgId}:status-values`);
    await invalidatePlanning(normalizedOrgId);
    await invalidateKpiAndStats(normalizedOrgId);
  }

  const affectedUsers = userIds ?? (userId !== undefined ? [userId] : []);
  for (const uid of affectedUsers) {
    await delKeyFamily(cacheKeys.userOrganizations(uid));
    if (normalizedOrgId !== undefined) {
      await cache.del(cacheKeys.userPerms(uid, normalizedOrgId));
    }
  }
}

export async function invalidateCustomerCaches(payload: InvalidatePayload): Promise<void> {
  const { customerId, orgId } = payload;
  const normalizedCustomerId = normalizeId(customerId);
  const normalizedOrgId = normalizeId(orgId);
  if (normalizedCustomerId !== undefined) {
    await cache.del(cacheKeys.customer(normalizedCustomerId));
    await cache.del(cacheKeys.customerProjects(normalizedCustomerId));
    await cache.del(cacheKeys.customerOverview(normalizedCustomerId));
  }
  if (normalizedOrgId !== undefined) {
    await delKeyFamily(cacheKeys.orgCustomers(normalizedOrgId));
    await invalidateKpiAndStats(normalizedOrgId);
  }
}

export async function invalidateApplicationCaches(payload: InvalidatePayload): Promise<void> {
  const { applicationId, orgId } = payload;
  const normalizedApplicationId = normalizeId(applicationId);
  const normalizedOrgId = normalizeId(orgId);
  if (normalizedApplicationId !== undefined) {
    await cache.del(cacheKeys.application(normalizedApplicationId));
    await cache.del(cacheKeys.applicationVersions(normalizedApplicationId));
    await cache.del(cacheKeys.applicationTasks(normalizedApplicationId));
  }
  if (normalizedOrgId !== undefined) {
    await delKeyFamily(cacheKeys.orgApplications(normalizedOrgId));
    await invalidateKpiAndStats(normalizedOrgId);
  }
}

export async function invalidateProjectCaches(payload: InvalidatePayload): Promise<void> {
  const { projectId, orgId, customerId } = payload;
  const normalizedProjectId = normalizeId(projectId);
  const normalizedOrgId = normalizeId(orgId);
  const normalizedCustomerId = normalizeId(customerId);
  if (normalizedProjectId !== undefined) {
    await cache.del(cacheKeys.project(normalizedProjectId));
    await cache.del(cacheKeys.projectPermissions(normalizedProjectId));
    await delKeyFamily(cacheKeys.projectTasks(normalizedProjectId));
    await cache.del(cacheKeys.projectTasksSummary(normalizedProjectId));
    await cache.del(cacheKeys.projectSprints(normalizedProjectId));
    await cache.del(cacheKeys.projectMilestones(normalizedProjectId));
    await cache.delByPrefix(`allocations:project:${normalizedProjectId}`);
    await cache.delByPrefix(`time-entries:project:${normalizedProjectId}`);
  }
  if (normalizedOrgId !== undefined) {
    await cache.del(cacheKeys.orgProjects(normalizedOrgId));
    await invalidatePlanning(normalizedOrgId);
    await invalidateKpiAndStats(normalizedOrgId, normalizedProjectId);
  }
  if (normalizedCustomerId !== undefined) {
    await cache.del(cacheKeys.customerProjects(normalizedCustomerId));
    await cache.del(cacheKeys.customerOverview(normalizedCustomerId));
  }
}

export async function invalidateTaskCaches(payload: InvalidatePayload): Promise<void> {
  const { taskId, projectId, orgId, userId, userIds, ticketId } = payload;
  const normalizedTaskId = normalizeId(taskId);
  const normalizedProjectId = normalizeId(projectId);
  const normalizedOrgId = normalizeId(orgId);
  const normalizedTicketId = normalizeId(ticketId);
  if (normalizedTaskId !== undefined) {
    await cache.del(cacheKeys.task(normalizedTaskId));
    await cache.delByPrefix(`child-allocations:parent:${normalizedTaskId}`);
  }
  if (normalizedProjectId !== undefined) {
    await delKeyFamily(cacheKeys.projectTasks(normalizedProjectId));
    await cache.del(cacheKeys.projectTasksSummary(normalizedProjectId));
    await cache.delByPrefix(`allocations:task:`);
    await cache.delByPrefix(`time-entries:task:`);
  }
  if (normalizedOrgId !== undefined) {
    await invalidatePlanning(normalizedOrgId);
    await invalidateKpiAndStats(normalizedOrgId, normalizedProjectId);
  }
  const affectedUsers = userIds ?? (userId !== undefined ? [userId] : []);
  for (const uid of affectedUsers) {
    await cache.del(cacheKeys.userMyTasks(uid));
    await delKeyFamily(cacheKeys.userOrganizations(uid));
  }
  if (normalizedTicketId !== undefined) {
    await cache.del(cacheKeys.ticket(normalizedTicketId));
  }
}

export async function invalidateTicketCaches(payload: InvalidatePayload): Promise<void> {
  const { ticketId, orgId, userId, userIds } = payload;
  const normalizedTicketId = normalizeId(ticketId);
  const normalizedOrgId = normalizeId(orgId);
  if (normalizedTicketId !== undefined) {
    await delKeyFamily(cacheKeys.ticket(normalizedTicketId));
  }
  if (normalizedOrgId !== undefined) {
    await delKeyFamily(cacheKeys.orgTickets(normalizedOrgId));
    await delKeyFamily(cacheKeys.ticketsStats(normalizedOrgId));
    await invalidateKpiAndStats(normalizedOrgId);
  }
  const affectedUsers = userIds ?? (userId !== undefined ? [userId] : []);
  for (const uid of affectedUsers) {
    await cache.del(cacheKeys.userMyTickets(uid));
  }
}

export async function invalidateAllocationCaches(payload: InvalidatePayload): Promise<void> {
  const { orgId, projectId, taskId } = payload;
  const normalizedOrgId = normalizeId(orgId);
  const normalizedProjectId = normalizeId(projectId);
  const normalizedTaskId = normalizeId(taskId);
  await cache.delByPrefix('allocations:');
  if (normalizedProjectId !== undefined) {
    await cache.delByPrefix(`allocations:project:${normalizedProjectId}`);
  }
  if (normalizedTaskId !== undefined) {
    await cache.delByPrefix(`allocations:task:${normalizedTaskId}`);
  }
  if (normalizedOrgId !== undefined) {
    await invalidatePlanning(normalizedOrgId);
    await invalidateKpiAndStats(normalizedOrgId, normalizedProjectId);
  }
}

export async function invalidateTimeEntryCaches(payload: InvalidatePayload): Promise<void> {
  const { orgId, projectId, taskId } = payload;
  const normalizedOrgId = normalizeId(orgId);
  const normalizedProjectId = normalizeId(projectId);
  const normalizedTaskId = normalizeId(taskId);
  await cache.delByPrefix('time-entries:');
  if (normalizedProjectId !== undefined) {
    await cache.delByPrefix(`time-entries:project:${normalizedProjectId}`);
  }
  if (normalizedTaskId !== undefined) {
    await cache.delByPrefix(`time-entries:task:${normalizedTaskId}`);
  }
  if (normalizedOrgId !== undefined) {
    await invalidatePlanning(normalizedOrgId);
    await invalidateKpiAndStats(normalizedOrgId, normalizedProjectId);
  }
}

export async function invalidateStatusValueCaches(orgId: number | string, statusType?: string): Promise<void> {
  if (statusType) {
    await cache.del(cacheKeys.orgStatusValues(orgId, statusType));
  } else {
    await cache.delByPrefix(`org:${orgId}:status-values`);
  }
  await invalidatePlanning(orgId);
}

export async function invalidatePermissionCaches(payload: InvalidatePayload): Promise<void> {
  const { orgId, userId, userIds } = payload;
  const normalizedOrgId = normalizeId(orgId);
  const affectedUsers = userIds ?? (userId !== undefined ? [userId] : []);
  for (const uid of affectedUsers) {
    if (normalizedOrgId !== undefined) {
      await cache.del(cacheKeys.userPerms(uid, normalizedOrgId));
    }
    await delKeyFamily(cacheKeys.userOrganizations(uid));
  }
  if (normalizedOrgId !== undefined) {
    await cache.del(cacheKeys.orgPermissionGroups(normalizedOrgId));
  }
}

export async function invalidateTagCaches(orgId: number | string): Promise<void> {
  await delKeyFamily(cacheKeys.orgTags(orgId));
}

export async function invalidateCustomFieldCaches(orgId: number | string): Promise<void> {
  await delKeyFamily(cacheKeys.orgCustomFields(orgId));
}

export async function invalidateWorkflowCaches(orgId: number | string): Promise<void> {
  await cache.del(cacheKeys.orgWorkflow(orgId));
}

export async function invalidateSlaCaches(orgId: number | string): Promise<void> {
  await cache.del(cacheKeys.orgSla(orgId));
}

export async function invalidateMemoCaches(orgId: number | string): Promise<void> {
  await cache.del(cacheKeys.orgMemos(orgId));
}

export async function invalidateEmailQueueCaches(userId: number): Promise<void> {
  await delKeyFamily(cacheKeys.userEmailQueue(userId));
}

export async function invalidateGridPreferenceCaches(userId: number, gridKey: string): Promise<void> {
  await cache.del(cacheKeys.userGridPref(userId, gridKey));
}

export async function invalidateSprintCaches(projectId: number | string, orgId?: number | string): Promise<void> {
  await cache.del(cacheKeys.projectSprints(projectId));
  if (orgId !== undefined) {
    await invalidatePlanning(orgId);
  }
}

export async function invalidateMilestoneCaches(projectId: number | string, orgId?: number | string): Promise<void> {
  await cache.del(cacheKeys.projectMilestones(projectId));
  if (orgId !== undefined) {
    await invalidatePlanning(orgId);
  }
}

export async function invalidateHolidayCaches(scope: string, orgId?: number | string): Promise<void> {
  await cache.delByPrefix('holidays:');
  if (orgId !== undefined) {
    await invalidatePlanning(orgId);
  }
}

export async function invalidateVacationCaches(scope: string, orgId?: number | string): Promise<void> {
  await cache.delByPrefix('vacations:');
  if (orgId !== undefined) {
    await invalidatePlanning(orgId);
  }
}

export async function invalidateOooCaches(scope: string, orgId?: number | string): Promise<void> {
  await cache.delByPrefix('ooo:');
  if (orgId !== undefined) {
    await invalidatePlanning(orgId);
  }
}

export async function invalidateCallRecordCaches(scope: string, orgId?: number | string): Promise<void> {
  await cache.delByPrefix('call-records:');
  if (orgId !== undefined) {
    await invalidatePlanning(orgId);
  }
}

export async function invalidateRecurringAllocationCaches(scope: string, orgId?: number | string): Promise<void> {
  await cache.delByPrefix('recurring:');
  if (orgId !== undefined) {
    await invalidatePlanning(orgId);
  }
}

export async function invalidateChildAllocationCaches(parentId: number | string, orgId?: number | string): Promise<void> {
  await cache.del(cacheKeys.childAllocations(parentId));
  if (orgId !== undefined) {
    await invalidatePlanning(orgId);
  }
}

export async function invalidateUserListCaches(): Promise<void> {
  await cache.del(cacheKeys.usersList());
}

export async function invalidateAggregateCaches(orgId?: number | string, projectId?: number | string): Promise<void> {
  await invalidateKpiAndStats(orgId, projectId);
}

export async function invalidatePortalCaches(scope: string): Promise<void> {
  await cache.del(cacheKeys.portalOverview(scope));
}

/** Central dispatcher — call from write handlers after successful DB commit. */
export async function invalidateByEntity(type: CacheEntityType, payload: InvalidatePayload = {}): Promise<void> {
  switch (type) {
    case 'authToken':
      if (payload.tokenHash) await invalidateAuthTokenCaches(payload.tokenHash);
      break;
    case 'settings':
      await invalidateSettingsCaches();
      break;
    case 'organization':
      await invalidateOrganizationCaches(payload);
      break;
    case 'customer':
      await invalidateCustomerCaches(payload);
      break;
    case 'application':
      await invalidateApplicationCaches(payload);
      break;
    case 'project':
      await invalidateProjectCaches(payload);
      break;
    case 'task':
      await invalidateTaskCaches(payload);
      break;
    case 'ticket':
      await invalidateTicketCaches(payload);
      break;
    case 'allocation':
      await invalidateAllocationCaches(payload);
      break;
    case 'timeEntry':
      await invalidateTimeEntryCaches(payload);
      break;
    case 'tag':
      if (payload.orgId !== undefined) await invalidateTagCaches(normalizeId(payload.orgId)!);
      break;
    case 'statusValue':
      if (payload.orgId !== undefined) await invalidateStatusValueCaches(normalizeId(payload.orgId)!, payload.statusType);
      break;
    case 'permission':
    case 'permissionGroup':
      await invalidatePermissionCaches(payload);
      break;
    case 'customField':
      if (payload.orgId !== undefined) await invalidateCustomFieldCaches(normalizeId(payload.orgId)!);
      break;
    case 'workflow':
      if (payload.orgId !== undefined) await invalidateWorkflowCaches(normalizeId(payload.orgId)!);
      break;
    case 'sla':
      if (payload.orgId !== undefined) await invalidateSlaCaches(normalizeId(payload.orgId)!);
      break;
    case 'memo':
      if (payload.orgId !== undefined) await invalidateMemoCaches(normalizeId(payload.orgId)!);
      break;
    case 'emailQueue':
      if (payload.userId !== undefined) await invalidateEmailQueueCaches(payload.userId);
      break;
    case 'gridPreference':
      if (payload.userId !== undefined && payload.gridKey) {
        await invalidateGridPreferenceCaches(payload.userId, payload.gridKey);
      }
      break;
    case 'sprint':
      if (payload.projectId !== undefined) {
        await invalidateSprintCaches(normalizeId(payload.projectId)!, normalizeId(payload.orgId));
      }
      break;
    case 'milestone':
      if (payload.projectId !== undefined) {
        await invalidateMilestoneCaches(normalizeId(payload.projectId)!, normalizeId(payload.orgId));
      }
      break;
    case 'holiday':
      await invalidateHolidayCaches(String(normalizeId(payload.orgId) ?? 'global'), normalizeId(payload.orgId));
      break;
    case 'vacation':
      await invalidateVacationCaches(String(normalizeId(payload.orgId) ?? 'global'), normalizeId(payload.orgId));
      break;
    case 'ooo':
      await invalidateOooCaches(String(normalizeId(payload.orgId) ?? 'global'), normalizeId(payload.orgId));
      break;
    case 'callRecord':
      await invalidateCallRecordCaches(String(normalizeId(payload.orgId) ?? 'global'), normalizeId(payload.orgId));
      break;
    case 'recurringAllocation':
      await invalidateRecurringAllocationCaches(String(payload.userId ?? normalizeId(payload.orgId) ?? 'global'), normalizeId(payload.orgId));
      break;
    case 'childAllocation':
      if (payload.parentAllocationId !== undefined) {
        await invalidateChildAllocationCaches(payload.parentAllocationId, normalizeId(payload.orgId));
      }
      break;
    case 'user':
      await invalidateUserListCaches();
      break;
    case 'kpi':
    case 'stats':
    case 'search':
      await invalidateAggregateCaches(normalizeId(payload.orgId), normalizeId(payload.projectId));
      break;
    case 'portal':
      await invalidatePortalCaches(String(normalizeId(payload.orgId) ?? normalizeId(payload.customerId) ?? 'global'));
      break;
    default:
      break;
  }
}
