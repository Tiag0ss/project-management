import { pool } from '../config/database';

/**
 * Log a change in organization data
 */
export async function logOrganizationHistory(
  organizationId: number,
  changedBy: number,
  changeType: string,
  fieldName: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO OrganizationHistory (OrganizationId, ChangedBy, ChangeType, FieldName, OldValue, NewValue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [organizationId, changedBy, changeType, fieldName, oldValue, newValue]
    );
  } catch (error) {
    console.error('Error logging organization history:', error);
  }
}

/**
 * Log a change in customer data
 */
export async function logCustomerHistory(
  customerId: number,
  changedBy: number,
  changeType: string,
  fieldName: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO CustomerHistory (CustomerId, ChangedBy, ChangeType, FieldName, OldValue, NewValue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customerId, changedBy, changeType, fieldName, oldValue, newValue]
    );
  } catch (error) {
    console.error('Error logging customer history:', error);
  }
}

/**
 * Log a change in project data
 */
export async function logProjectHistory(
  projectId: number,
  changedBy: number,
  changeType: string,
  fieldName: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO ProjectHistory (ProjectId, ChangedBy, ChangeType, FieldName, OldValue, NewValue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projectId, changedBy, changeType, fieldName, oldValue, newValue]
    );
  } catch (error) {
    console.error('Error logging project history:', error);
  }
}

/**
 * Log a change in user data
 */
export async function logUserHistory(
  userId: number,
  changedBy: number,
  changeType: string,
  fieldName: string | null = null,
  oldValue: string | null = null,
  newValue: string | null = null
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO UserHistory (UserId, ChangedBy, ChangeType, FieldName, OldValue, NewValue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, changedBy, changeType, fieldName, oldValue, newValue]
    );
  } catch (error) {
    console.error('Error logging user history:', error);
  }
}
