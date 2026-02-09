import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface User {
  Id: number;
  Username: string;
  Email: string;
  FirstName?: string;
  LastName?: string;
  IsActive: boolean;
  IsAdmin: boolean;
  CustomerId?: number | null;
  CustomerName?: string | null;
  IsDeveloper?: boolean;
  IsSupport?: boolean;
  IsManager?: boolean;
  WorkHoursMonday?: number;
  WorkHoursTuesday?: number;
  WorkHoursWednesday?: number;
  WorkHoursThursday?: number;
  WorkHoursFriday?: number;
  WorkHoursSaturday?: number;
  WorkHoursSunday?: number;
  WorkStartMonday?: string;
  WorkStartTuesday?: string;
  WorkStartWednesday?: string;
  WorkStartThursday?: string;
  WorkStartFriday?: string;
  WorkStartSaturday?: string;
  WorkStartSunday?: string;
  LunchTime?: string;
  LunchDuration?: number;
  HobbyStartMonday?: string;
  HobbyHoursMonday?: number;
  HobbyStartTuesday?: string;
  HobbyHoursTuesday?: number;
  HobbyStartWednesday?: string;
  HobbyHoursWednesday?: number;
  HobbyStartThursday?: string;
  HobbyHoursThursday?: number;
  HobbyStartFriday?: string;
  HobbyHoursFriday?: number;
  HobbyStartSaturday?: string;
  HobbyHoursSaturday?: number;
  HobbyStartSunday?: string;
  HobbyHoursSunday?: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface UpdateUserData {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  isAdmin: boolean;
  isDeveloper?: boolean;
  isSupport?: boolean;
  isManager?: boolean;
  customerId?: number | null;
  workHoursMonday?: number;
  workHoursTuesday?: number;
  workHoursWednesday?: number;
  workHoursThursday?: number;
  workHoursFriday?: number;
  workHoursSaturday?: number;
  workHoursSunday?: number;
}

export interface CreateUserData extends UpdateUserData {
  password: string;
}

export const usersApi = {
  async getAll(token: string): Promise<{ success: boolean; users: User[] }> {
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch users');
    }

    return data;
  },

  async create(userData: CreateUserData, token: string): Promise<{ success: boolean; userId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create user');
    }

    return data;
  },

  async update(id: number, userData: UpdateUserData, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update user');
    }

    return data;
  },

  async resetPassword(id: number, newPassword: string, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/users/${id}/password`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newPassword }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to reset password');
    }

    return data;
  },

  async delete(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete user');
    }

    return data;
  },

  async getByOrganization(organizationId: number, token: string): Promise<{ success: boolean; users: User[] }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch organization users');
    }

    return data;
  },

  async updateWorkHours(workHours: {
    monday?: number;
    tuesday?: number;
    wednesday?: number;
    thursday?: number;
    friday?: number;
    saturday?: number;
    sunday?: number;
    mondayStart?: string;
    tuesdayStart?: string;
    wednesdayStart?: string;
    thursdayStart?: string;
    fridayStart?: string;
    saturdayStart?: string;
    sundayStart?: string;
    lunchTime?: string;
    lunchDuration?: number;
  }, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/users/work-hours`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workHours),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update work hours');
    }

    return data;
  },

  async getProfile(token: string): Promise<{ success: boolean; user: User }> {
    const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch profile');
    }

    return data;
  }
};

