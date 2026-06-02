import { getApiUrl } from './config';

export interface PdfTableExportPayload {
  title: string;
  filename: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
  layout?: 'portrait' | 'landscape';
}

export async function downloadTablePdf(payload: PdfTableExportPayload, token: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/pdf-exports/table`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Failed to export PDF';
    try {
      const errorData = await response.json();
      if (typeof errorData?.message === 'string' && errorData.message.trim()) {
        message = errorData.message;
      }
    } catch {
      // Ignore JSON parsing errors and keep default message
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${payload.filename}_${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}
