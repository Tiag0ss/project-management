import { getApiUrl } from './config';

const API_URL = getApiUrl();

export interface Memo {
  Id: number;
  UserId: number;
  Title: string;
  Content?: string;
  Visibility: 'private' | 'organizations' | 'public';
  CreatedAt: string;
  UpdatedAt: string;
  Username: string;
  FirstName?: string;
  LastName?: string;
  Tags?: string; // Comma-separated
  Attachments?: MemoAttachment[];
}

export interface MemoAttachment {
  Id: number;
  MemoId: number;
  FileName: string;
  FilePath: string;
  FileSize: number;
  UploadedBy: number;
  UploadedAt: string;
}

export interface TagCount {
  TagName: string;
  count: number;
}

export async function getMemos(token: string): Promise<Memo[]> {
  const response = await fetch(`${API_URL}/api/memos`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch memos');
  }

  const data = await response.json();
  return data.memos || [];
}

export async function getMemo(id: number, token: string): Promise<Memo> {
  const response = await fetch(`${API_URL}/api/memos/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch memo');
  }

  const data = await response.json();
  return data.memo;
}

export async function createMemo(
  memoData: {
    title: string;
    content?: string;
    visibility: 'private' | 'organizations' | 'public';
    tags?: string[];
  },
  token: string
): Promise<number> {
  const response = await fetch(`${API_URL}/api/memos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(memoData),
  });

  if (!response.ok) {
    throw new Error('Failed to create memo');
  }

  const data = await response.json();
  return data.memoId;
}

export async function updateMemo(
  id: number,
  memoData: {
    title: string;
    content?: string;
    visibility: 'private' | 'organizations' | 'public';
    tags?: string[];
  },
  token: string
): Promise<void> {
  const response = await fetch(`${API_URL}/api/memos/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(memoData),
  });

  if (!response.ok) {
    throw new Error('Failed to update memo');
  }
}

export async function deleteMemo(id: number, token: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/memos/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete memo');
  }
}

export async function getAllTags(token: string): Promise<TagCount[]> {
  const response = await fetch(`${API_URL}/api/memos/tags`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch tags');
  }

  const data = await response.json();
  return data.tags || [];
}
