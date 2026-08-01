import { getApiUrl } from './config';

const API_URL = getApiUrl();

export interface TaskAttachment {
  Id: number;
  TaskId: number;
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

export async function getTaskAttachment(attachmentId: number, token: string): Promise<TaskAttachment> {
  const response = await fetch(`${API_URL}/api/task-attachments/${attachmentId}`, {
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
