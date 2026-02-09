import { getApiUrl } from './config';

const API_URL = getApiUrl();

export interface TicketHistoryEntry {
  Id: number;
  TicketId: number;
  UserId: number;
  Action: string;
  FieldName: string | null;
  OldValue: string | null;
  NewValue: string | null;
  CreatedAt: string;
  FirstName: string;
  LastName: string;
  Username: string;
}

export interface TicketAttachment {
  Id: number;
  TicketId: number;
  UploadedByUserId: number;
  FileName: string;
  FileType: string;
  FileSize: number;
  FileData?: string; // Base64 encoded
  CreatedAt: string;
  FirstName: string;
  LastName: string;
  Username: string;
}

export async function getTicketHistory(ticketId: number, token: string): Promise<TicketHistoryEntry[]> {
  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/history`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch ticket history');
  }

  const result = await response.json();
  return result.data;
}

export async function getTicketAttachments(ticketId: number, token: string): Promise<TicketAttachment[]> {
  const response = await fetch(`${API_URL}/api/ticket-attachments/ticket/${ticketId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch attachments');
  }

  const result = await response.json();
  return result.data;
}

export async function getTicketAttachment(attachmentId: number, token: string): Promise<TicketAttachment> {
  const response = await fetch(`${API_URL}/api/ticket-attachments/${attachmentId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch attachment');
  }

  const result = await response.json();
  return result.data;
}

export async function uploadTicketAttachment(
  ticketId: number,
  fileName: string,
  fileType: string,
  fileSize: number,
  fileData: string,
  token: string
): Promise<number> {
  const response = await fetch(`${API_URL}/api/ticket-attachments/ticket/${ticketId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileName, fileType, fileSize, fileData }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload attachment');
  }

  const result = await response.json();
  return result.attachmentId;
}

export async function deleteTicketAttachment(attachmentId: number, token: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/ticket-attachments/${attachmentId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete attachment');
  }
}
