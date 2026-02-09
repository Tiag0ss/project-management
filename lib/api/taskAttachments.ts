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

export async function getTaskAttachments(taskId: number, token: string): Promise<TaskAttachment[]> {
  const response = await fetch(`${API_URL}/api/task-attachments/task/${taskId}`, {
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

export async function uploadTaskAttachment(
  taskId: number,
  fileName: string,
  fileType: string,
  fileSize: number,
  fileData: string,
  token: string
): Promise<number> {
  const response = await fetch(`${API_URL}/api/task-attachments/task/${taskId}`, {
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

export async function deleteTaskAttachment(attachmentId: number, token: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/task-attachments/${attachmentId}`, {
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
