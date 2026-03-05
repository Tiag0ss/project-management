import { getApiUrl } from './config';

const API_URL = getApiUrl();

export interface GridPreference {
  gridKey: string;
  columnOrder?: string[];
  hiddenColumns?: string[];
  columnSizing?: Record<string, number>;
  columnSizeMode?: Record<string, 'fixed' | 'grow'>;
  sortField?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  rowDensity?: 'compact' | 'comfortable';
}

export async function getAllGridPreferences(token: string): Promise<GridPreference[]> {
  const response = await fetch(`${API_URL}/api/grid-preferences`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to load grid preferences');
  }

  return Array.isArray(data.preferences) ? data.preferences : [];
}

export async function saveGridPreference(
  token: string,
  gridKey: string,
  preference: Omit<GridPreference, 'gridKey'>
): Promise<void> {
  const response = await fetch(`${API_URL}/api/grid-preferences/${encodeURIComponent(gridKey)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preference),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to save grid preference');
  }
}
