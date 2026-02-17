const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface RecurringAllocation {
  Id: number;
  UserId: number;
  Title: string;
  Description?: string;
  RecurrenceType: string;
  RecurrenceInterval?: number;
  DaysOfWeek?: string;
  StartDate: string;
  EndDate?: string;
  StartTime: string;
  EndTime: string;
  IsActive: boolean;
  CreatedAt: string;
}

export interface RecurringAllocationOccurrence {
  Id: number;
  RecurringAllocationId: number;
  UserId: number;
  OccurrenceDate: string;
  StartTime: string;
  EndTime: string;
  AllocatedHours: number;
  Title?: string;
  Description?: string;
  CreatedAt: string;
}

export const recurringAllocationsApi = {
  // Get all recurring allocations for a user
  getUserAllocations: async (userId: number, token: string): Promise<RecurringAllocation[]> => {
    const response = await fetch(`${API_URL}/api/recurring-allocations/user/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch recurring allocations');
    }

    const data = await response.json();
    return data.allocations || [];
  },

  // Get single recurring allocation
  getById: async (id: number, token: string): Promise<RecurringAllocation> => {
    const response = await fetch(`${API_URL}/api/recurring-allocations/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch recurring allocation');
    }

    const data = await response.json();
    return data.allocation;
  },

  // Create recurring allocation
  create: async (allocation: Partial<RecurringAllocation>, token: string): Promise<number> => {
    const response = await fetch(`${API_URL}/api/recurring-allocations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(allocation),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create recurring allocation');
    }

    const data = await response.json();
    return data.recurringAllocationId;
  },

  // Update recurring allocation
  update: async (id: number, allocation: Partial<RecurringAllocation>, token: string): Promise<void> => {
    const response = await fetch(`${API_URL}/api/recurring-allocations/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(allocation),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update recurring allocation');
    }
  },

  // Delete recurring allocation
  delete: async (id: number, token: string): Promise<void> => {
    const response = await fetch(`${API_URL}/api/recurring-allocations/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete recurring allocation');
    }
  },

  // Get occurrences for a user in a date range
  getOccurrences: async (
    userId: number,
    startDate?: string,
    endDate?: string,
    token?: string
  ): Promise<RecurringAllocationOccurrence[]> => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await fetch(
      `${API_URL}/api/recurring-allocations/occurrences/user/${userId}?${params.toString()}`,
      {
        headers: token ? {
          'Authorization': `Bearer ${token}`,
        } : {},
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch recurring allocation occurrences');
    }

    const data = await response.json();
    return data.occurrences || [];
  },
};
