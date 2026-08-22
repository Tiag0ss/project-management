import { getApiUrl } from './config';

const API_URL = getApiUrl();

export interface Expense {
  Id: number;
  OrganizationId: number;
  ProjectId: number | null;
  TaskId: number | null;
  CategoryId: number;
  SubmittedByUserId: number;
  Title: string;
  Description?: string | null;
  Vendor?: string | null;
  Amount: number;
  /** Cap approved for reimbursement; null/undefined means equal to Amount */
  ReimbursableAmount?: number | null;
  ExpenseDate: string;
  PaidBy: 'employee' | 'company';
  ApprovalStatus: 'pending' | 'approved' | 'rejected';
  ApprovedBy?: number | null;
  ApprovedAt?: string | null;
  ReimbursedAmount: number;
  ReimbursementStatus: 'not_required' | 'pending' | 'partial' | 'reimbursed' | 'not_applicable';
  ReimbursedBy?: number | null;
  ReimbursedAt?: string | null;
  CreatedAt?: string;
  UpdatedAt?: string;
  OrganizationName?: string;
  ProjectName?: string | null;
  TaskName?: string | null;
  CategoryName?: string;
  CategoryColor?: string;
  CategoryGroupId?: number;
  CategoryGroupName?: string;
  CategoryGroupColor?: string;
  CategoryMaxReimbursementAmount?: number | null;
  SubmittedByUsername?: string;
  SubmittedByFirstName?: string;
  SubmittedByLastName?: string;
  RemainingAmount?: number;
  AttachmentCount?: number;
}

export interface ExpenseCategoryGroup {
  Id: number;
  OrganizationId: number;
  GroupName: string;
  ColorCode?: string;
  SortOrder: number;
  IsDefault: number | boolean;
  CategoryCount?: number;
}

export interface ExpenseCategory {
  Id: number;
  OrganizationId: number;
  GroupId: number;
  CategoryName: string;
  ColorCode?: string;
  SortOrder: number;
  IsDefault: number | boolean;
  MaxReimbursementAmount?: number | null;
  GroupName?: string;
  GroupColorCode?: string;
}

export interface ExpenseAttachmentMeta {
  Id: number;
  ExpenseId: number;
  UploadedByUserId: number;
  FileName: string;
  FileType: string;
  FileSize: number;
  CreatedAt?: string;
  FirstName?: string;
  LastName?: string;
  Username?: string;
}

export interface ExpenseReimbursementPayment {
  Id: number;
  ExpenseId: number;
  Amount: number;
  Notes?: string | null;
  CreatedByUserId: number;
  CreatedAt: string;
  Username?: string;
  FirstName?: string;
  LastName?: string;
}

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export async function listExpenses(
  token: string,
  query: Record<string, string | number | undefined | null> = {}
): Promise<Expense[]> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  const res = await fetch(`${API_URL}/api/expenses${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to list expenses');
  }
  const data = await res.json();
  return data.data || [];
}

export async function getExpenseSummary(token: string, organizationId?: number) {
  const qs = organizationId ? `?organizationId=${organizationId}` : '';
  const res = await fetch(`${API_URL}/api/expenses/summary${qs}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to load expense summary');
  }
  return (await res.json()).data;
}

export async function createExpense(token: string, payload: Record<string, unknown>): Promise<Expense> {
  const res = await fetch(`${API_URL}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create expense');
  }
  return (await res.json()).data;
}

export async function updateExpense(
  token: string,
  id: number,
  payload: Record<string, unknown>
): Promise<Expense> {
  const res = await fetch(`${API_URL}/api/expenses/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update expense');
  }
  return (await res.json()).data;
}

export async function deleteExpense(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/expenses/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete expense');
  }
}

export async function approveExpense(
  token: string,
  id: number,
  status: 'approved' | 'rejected' | 'pending'
): Promise<Expense> {
  const res = await fetch(`${API_URL}/api/expenses/${id}/approval`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update approval');
  }
  return (await res.json()).data;
}

export async function recordReimbursement(
  token: string,
  id: number,
  amount: number,
  notes?: string,
  options?: { reimbursableAmount?: number | null; settleRemaining?: boolean }
): Promise<Expense> {
  const res = await fetch(`${API_URL}/api/expenses/${id}/reimbursements`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      amount,
      notes,
      reimbursableAmount: options?.reimbursableAmount,
      settleRemaining: options?.settleRemaining,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to record reimbursement');
  }
  return (await res.json()).data;
}

export async function listReimbursements(
  token: string,
  id: number
): Promise<ExpenseReimbursementPayment[]> {
  const res = await fetch(`${API_URL}/api/expenses/${id}/reimbursements`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to list reimbursements');
  }
  return (await res.json()).data || [];
}

export async function listExpenseCategoryGroups(
  token: string,
  orgId: number
): Promise<ExpenseCategoryGroup[]> {
  const res = await fetch(`${API_URL}/api/status-values/expense-category-group/${orgId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to load category groups');
  }
  return (await res.json()).groups || [];
}

export async function listExpenseCategories(
  token: string,
  orgId: number
): Promise<ExpenseCategory[]> {
  const res = await fetch(`${API_URL}/api/status-values/expense-category/${orgId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to load categories');
  }
  return (await res.json()).categories || [];
}

export async function listExpenseAttachments(
  token: string,
  expenseId: number
): Promise<ExpenseAttachmentMeta[]> {
  const res = await fetch(`${API_URL}/api/expense-attachments/expense/${expenseId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to list attachments');
  }
  return (await res.json()).data || [];
}

export async function uploadExpenseAttachment(
  token: string,
  expenseId: number,
  fileName: string,
  fileType: string,
  fileSize: number,
  fileData: string
): Promise<ExpenseAttachmentMeta> {
  const res = await fetch(`${API_URL}/api/expense-attachments/expense/${expenseId}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ fileName, fileType, fileSize, fileData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to upload attachment');
  }
  return (await res.json()).data;
}

export async function deleteExpenseAttachment(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/expense-attachments/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete attachment');
  }
}

export async function getExpenseAttachment(
  token: string,
  id: number
): Promise<ExpenseAttachmentMeta & { FileData: string }> {
  const res = await fetch(`${API_URL}/api/expense-attachments/${id}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to load attachment');
  }
  return (await res.json()).data;
}
