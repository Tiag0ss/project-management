import { getApiUrl } from './config';

const API_URL = getApiUrl();

export interface Customer {
  Id: number;
  Name: string;
  Email: string | null;
  Phone: string | null;
  Address: string | null;
  Notes: string | null;
  IsActive: number;
  CreatedBy: number;
  CreatedAt: string;
  UpdatedAt: string;
  OpenTickets?: number;
  Organizations?: CustomerOrganization[];
}

export interface CustomerOrganization {
  CustomerId: number;
  OrganizationId: number;
  OrganizationName?: string;
  CreatedAt: string;
}

export interface CreateCustomerData {
  Name: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  Notes?: string;
  OrganizationIds: number[];
  CreateDefaultProject?: boolean;
  DefaultProjectName?: string;
}

export interface UpdateCustomerData {
  Name?: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  Notes?: string;
  IsActive?: number;
  OrganizationIds?: number[];
}

export async function getCustomers(token: string): Promise<Customer[]> {
  const response = await fetch(`${API_URL}/api/customers`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch customers');
  }

  const data = await response.json();
  return data.data;
}

export async function getCustomersByOrganization(token: string, organizationId: number): Promise<Customer[]> {
  const response = await fetch(`${API_URL}/api/customers?organizationId=${organizationId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch customers');
  }

  const data = await response.json();
  return data.data;
}

export async function getCustomer(token: string, customerId: number): Promise<Customer> {
  const response = await fetch(`${API_URL}/api/customers/${customerId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch customer');
  }

  const data = await response.json();
  return data.data;
}

export async function createCustomer(token: string, customerData: CreateCustomerData): Promise<Customer> {
  const response = await fetch(`${API_URL}/api/customers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(customerData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to create customer');
  }

  const data = await response.json();
  return data.data;
}

export async function updateCustomer(token: string, customerId: number, customerData: UpdateCustomerData): Promise<Customer> {
  const response = await fetch(`${API_URL}/api/customers/${customerId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(customerData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to update customer');
  }

  const data = await response.json();
  return data.data;
}

export async function deleteCustomer(token: string, customerId: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/customers/${customerId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to delete customer');
  }
}
