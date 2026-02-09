import { getApiUrl } from './config';

const API_URL = getApiUrl();

export async function getSavedReports(token: string) {
  const response = await fetch(`${API_URL}/api/saved-reports`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

export async function getSavedReportsByDataSource(token: string, dataSource: string) {
  const response = await fetch(`${API_URL}/api/saved-reports/datasource/${dataSource}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

export async function createSavedReport(
  token: string,
  data: {
    dataSource: string;
    reportName: string;
    pivotConfig: any;
    filters?: any[];
  }
) {
  const response = await fetch(`${API_URL}/api/saved-reports`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function updateSavedReport(
  token: string,
  id: number,
  data: {
    reportName: string;
    pivotConfig: any;
    filters?: any[];
  }
) {
  const response = await fetch(`${API_URL}/api/saved-reports/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deleteSavedReport(token: string, id: number) {
  const response = await fetch(`${API_URL}/api/saved-reports/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}
