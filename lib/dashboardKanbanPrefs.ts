export type KanbanOrgFilter = 'all' | number;

const ORG_COOKIE = 'pm_dashboard_kanban_org';
const HIDDEN_STATUSES_COOKIE = 'pm_dashboard_kanban_hidden_statuses';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/** Parse stored org filter. Empty / missing / "all" → all organizations. */
export function parseKanbanOrgFilter(raw: string | null | undefined): KanbanOrgFilter {
  if (raw == null || raw === '' || raw === 'all') return 'all';
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return 'all';
  return id;
}

export function getKanbanOrgFilterFromCookie(): KanbanOrgFilter {
  return parseKanbanOrgFilter(readCookie(ORG_COOKIE));
}

export function setKanbanOrgFilterCookie(filter: KanbanOrgFilter): void {
  writeCookie(ORG_COOKIE, filter === 'all' ? 'all' : String(filter));
}

export type HiddenStatusesByOrg = Record<string, number[]>;

export function parseHiddenStatusesByOrg(raw: string | null | undefined): HiddenStatusesByOrg {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: HiddenStatusesByOrg = {};
    for (const [orgId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const ids = value
        .map((entry) => Number(entry))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (ids.length > 0) {
        result[String(orgId)] = Array.from(new Set(ids));
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getHiddenStatusesByOrgFromCookie(): HiddenStatusesByOrg {
  return parseHiddenStatusesByOrg(readCookie(HIDDEN_STATUSES_COOKIE));
}

export function setHiddenStatusesByOrgCookie(map: HiddenStatusesByOrg): void {
  writeCookie(HIDDEN_STATUSES_COOKIE, JSON.stringify(map));
}

export function getHiddenStatusIdsForOrg(
  map: HiddenStatusesByOrg,
  organizationId: number
): number[] {
  return map[String(organizationId)] || [];
}

export function withHiddenStatusToggled(
  map: HiddenStatusesByOrg,
  organizationId: number,
  statusId: number,
  hidden: boolean
): HiddenStatusesByOrg {
  const key = String(organizationId);
  const current = new Set(map[key] || []);
  if (hidden) current.add(statusId);
  else current.delete(statusId);

  const next: HiddenStatusesByOrg = { ...map };
  if (current.size === 0) {
    delete next[key];
  } else {
    next[key] = Array.from(current);
  }
  return next;
}

export function filterVisibleStatuses<T extends { Id: number }>(
  statuses: T[],
  hiddenIds: number[]
): T[] {
  if (!hiddenIds.length) return statuses;
  const hidden = new Set(hiddenIds);
  return statuses.filter((status) => !hidden.has(Number(status.Id)));
}
