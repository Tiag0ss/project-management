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

  // Create recurring allocation
  create: async (allocation: Partial<RecurringAllocation>, token: string): Promise<number> => {
    // Convert interface fields to API format (camelCase)
    const payload = {
      userId: allocation.UserId,
      title: allocation.Title,
      description: allocation.Description,
      recurrenceType: allocation.RecurrenceType,
      recurrenceInterval: allocation.RecurrenceInterval,
      daysOfWeek: allocation.DaysOfWeek,
      startDate: allocation.StartDate,
      endDate: allocation.EndDate,
      startTime: allocation.StartTime,
      endTime: allocation.EndTime,
    };

    const response = await fetch(`${API_URL}/api/recurring-allocations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
    // Convert interface fields to API format (camelCase)
    const payload = {
      title: allocation.Title,
      description: allocation.Description,
      recurrenceType: allocation.RecurrenceType,
      recurrenceInterval: allocation.RecurrenceInterval,
      daysOfWeek: allocation.DaysOfWeek,
      startDate: allocation.StartDate,
      endDate: allocation.EndDate,
      startTime: allocation.StartTime,
      endTime: allocation.EndTime,
      isActive: allocation.IsActive,
    };

    const response = await fetch(`${API_URL}/api/recurring-allocations/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
};
