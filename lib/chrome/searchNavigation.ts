/**
 * Resolve in-app destination for a global search hit.
 * Returns null when the result type has no navigable page (or feature disabled).
 */
export function resolveSearchResultHref(
  type: string,
  id: number,
  options?: {
    projectId?: number;
    internalTicketsEnabled?: boolean;
  }
): string | null {
  switch (type) {
    case 'task': {
      const projectId = Number(options?.projectId || 0);
      if (Number.isFinite(projectId) && projectId > 0) {
        return `/projects/${projectId}?task=${id}`;
      }
      return `/projects?task=${id}`;
    }
    case 'project':
      return `/projects/${id}`;
    case 'organization':
      return `/organizations/${id}`;
    case 'ticket':
      return options?.internalTicketsEnabled === false ? null : `/tickets/${id}`;
    case 'user':
      return `/users/${id}`;
    default:
      return null;
  }
}
