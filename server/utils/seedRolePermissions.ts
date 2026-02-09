import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const DEFAULT_ROLE_PERMISSIONS = [
  {
    roleName: 'Developer',
    permissions: {
      CanViewDashboard: 1,
      CanViewPlanning: 1,
      CanManageProjects: 0,
      CanCreateProjects: 0,  // Developers podem criar projetos
      CanDeleteProjects: 0,
      CanViewTasks: 1,
      CanManageTasks: 1,
      CanCreateTasks: 1,
      CanDeleteTasks: 0,
      CanAssignTasks: 0,
      CanManageTimeEntries: 1,
      CanViewReports: 0,  // Developers podem ver relatórios
      CanManageOrganizations: 0,
      CanManageUsers: 0,
      CanManageTickets: 0,  // Developers NÃO gerem tickets (só support)
      CanCreateTickets: 1,  // Mas podem criar tickets
      CanDeleteTickets: 0,
      CanAssignTickets: 0,
      CanCreateTaskFromTicket: 0,
      CanPlanTasks: 1,  // Developers podem planear as suas próprias tarefas
      CanViewOthersPlanning: 0,  // Mas não veem o planning de outros
      CanViewProjects: 1,
      CanViewCustomers: 0,
      CanManageCustomers: 0,
      CanCreateCustomers: 0,
      CanDeleteCustomers: 0,
    },
  },
  {
    roleName: 'Support',
    permissions: {
      CanViewDashboard: 1,
      CanViewPlanning: 1,
      CanViewProjects: 1,
      CanManageProjects: 0,
      CanCreateProjects: 0,
      CanDeleteProjects: 0,
      CanViewTasks: 1,
      CanManageTasks: 0,
      CanCreateTasks: 0,
      CanDeleteTasks: 0,
      CanAssignTasks: 0,
      CanManageTimeEntries: 1,
      CanViewReports: 0,
      CanManageOrganizations: 0,
      CanViewCustomers: 1,
      CanManageCustomers: 1,
      CanCreateCustomers: 1,
      CanDeleteCustomers: 0,
      CanManageUsers: 0,
      CanManageTickets: 1,
      CanCreateTickets: 1,
      CanDeleteTickets: 0,
      CanAssignTickets: 1,
      CanCreateTaskFromTicket: 0,
      CanPlanTasks: 0,  // Support não planeia tarefas
      CanViewOthersPlanning: 0,  // Nem vê o planning de outros
    },
  },
  {
    roleName: 'Manager',
    permissions: {
      CanViewDashboard: 1,
      CanViewPlanning: 1,
      CanViewProjects: 1,
      CanManageProjects: 1,
      CanCreateProjects: 1,
      CanDeleteProjects: 1,
      CanViewTasks: 1,
      CanManageTasks: 1,
      CanCreateTasks: 1,
      CanDeleteTasks: 1,
      CanAssignTasks: 1,
      CanManageTimeEntries: 1,
      CanViewReports: 1,
      CanManageOrganizations: 0,
      CanViewCustomers: 1,
      CanManageCustomers: 1,
      CanCreateCustomers: 1,
      CanDeleteCustomers: 1,
      CanManageUsers: 1,
      CanManageTickets: 1,
      CanCreateTickets: 1,
      CanDeleteTickets: 1,
      CanAssignTickets: 1,
      CanCreateTaskFromTicket: 1,
      CanPlanTasks: 1,  // Managers podem planear todas as tarefas
      CanViewOthersPlanning: 1,  // E veem o planning de toda a equipa
    },
  },
];

export async function seedRolePermissions(): Promise<void> {
  try {
    // Check if RolePermissions table exists and has data
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM RolePermissions'
    );

    if (existing[0].count > 0) {
      console.log('RolePermissions already seeded, skipping...');
      return;
    }

    console.log('Seeding default role permissions...');

    for (const role of DEFAULT_ROLE_PERMISSIONS) {
      const { roleName, permissions } = role;

      await pool.execute<ResultSetHeader>(
        `INSERT INTO RolePermissions (
          RoleName,
          CanViewDashboard,
          CanViewPlanning,
          CanViewProjects,
          CanManageProjects,
          CanCreateProjects,
          CanDeleteProjects,
          CanViewTasks,
          CanManageTasks,
          CanCreateTasks,
          CanDeleteTasks,
          CanAssignTasks,
          CanManageTimeEntries,
          CanViewReports,
          CanManageOrganizations,
          CanViewCustomers,
          CanManageCustomers,
          CanCreateCustomers,
          CanDeleteCustomers,
          CanManageUsers,
          CanManageTickets,
          CanCreateTickets,
          CanDeleteTickets,
          CanAssignTickets,
          CanCreateTaskFromTicket,
          CanPlanTasks,
          CanViewOthersPlanning
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roleName,
          permissions.CanViewDashboard,
          permissions.CanViewPlanning,
          permissions.CanViewProjects,
          permissions.CanManageProjects,
          permissions.CanCreateProjects,
          permissions.CanDeleteProjects,
          permissions.CanViewTasks,
          permissions.CanManageTasks,
          permissions.CanCreateTasks,
          permissions.CanDeleteTasks,
          permissions.CanAssignTasks,
          permissions.CanManageTimeEntries,
          permissions.CanViewReports,
          permissions.CanManageOrganizations,
          permissions.CanViewCustomers,
          permissions.CanManageCustomers,
          permissions.CanCreateCustomers,
          permissions.CanDeleteCustomers,
          permissions.CanManageUsers,
          permissions.CanManageTickets,
          permissions.CanCreateTickets,
          permissions.CanDeleteTickets,
          permissions.CanAssignTickets,
          permissions.CanCreateTaskFromTicket,
          permissions.CanPlanTasks,
          permissions.CanViewOthersPlanning,
        ]
      );

      console.log(`  ✓ Created permissions for ${roleName}`);
    }

    console.log('Role permissions seeded successfully');
  } catch (error: any) {
    // If table doesn't exist yet, ignore the error
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('RolePermissions table not yet created, will seed later...');
      return;
    }
    console.error('Error seeding role permissions:', error);
  }
}
