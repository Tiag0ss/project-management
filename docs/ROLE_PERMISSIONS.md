# Role Permissions System

## Overview

The Role Permissions system allows fine-grained control over what users can do in the application based on their assigned roles (Developer, Support, Manager).

## Architecture

### Database Tables

- **Users**: Contains role flags (`IsDeveloper`, `IsSupport`, `IsManager`)
- **RolePermissions**: Defines capabilities for each role

### Permission Types

#### View Permissions
- `CanViewDashboard`: Access to dashboard
- `CanViewPlanning`: Access to planning/Gantt view
- `CanViewReports`: Access to project reports

#### Project Permissions
- `CanManageProjects`: Edit project details
- `CanCreateProjects`: Create new projects
- `CanDeleteProjects`: Delete projects

#### Task Permissions
- `CanManageTasks`: Edit task details
- `CanCreateTasks`: Create new tasks
- `CanDeleteTasks`: Delete tasks
- `CanAssignTasks`: Assign tasks to users

#### Ticket Permissions
- `CanManageTickets`: Edit ticket details
- `CanCreateTickets`: Create new tickets
- `CanDeleteTickets`: Delete tickets
- `CanAssignTickets`: Assign tickets to users

#### Other Permissions
- `CanManageTimeEntries`: Manage time tracking entries
- `CanManageOrganizations`: Manage organization settings
- `CanManageUsers`: User management access

## Setup

### 1. Database Schema

The RolePermissions table is automatically created from:
```
server/database/structure/systemtables/RolePermissions.json
```

### 2. Default Permissions

Default role permissions are **automatically seeded** when the server starts for the first time.

The seed function (`server/utils/seedRolePermissions.ts`) runs after table creation and only inserts data if the table is empty.

**Default Permission Sets:**

**Developer:**
- View Dashboard ✓
- View Planning ✓
- Manage Tasks ✓
- Create Tasks ✓
- Manage Time Entries ✓
- Manage Tickets ✓
- Create Tickets ✓

**Support:**
- View Dashboard ✓
- View Planning ✓
- Manage Time Entries ✓
- View Reports ✓
- Manage Tickets ✓
- Create Tickets ✓
- Assign Tickets ✓

**Manager:**
- **All permissions** ✓

### 3. Frontend Usage

#### PermissionsContext

Wrap your app with `PermissionsProvider`:

```tsx
import { PermissionsProvider } from '@/contexts/PermissionsContext';

<AuthProvider>
  <PermissionsProvider>
    {children}
  </PermissionsProvider>
</AuthProvider>
```

#### Using Permissions in Components

```tsx
import { usePermissions } from '@/contexts/PermissionsContext';

function MyComponent() {
  const { permissions, isLoading } = usePermissions();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <>
      {permissions?.canCreateProjects && (
        <button>Create Project</button>
      )}
      
      {permissions?.canDeleteTasks && (
        <button>Delete Task</button>
      )}
    </>
  );
}
```

### 4. Backend Validation

Always validate permissions on the backend:

```typescript
import { getUserPermissions } from '@/lib/api/rolePermissions';

router.post('/api/projects', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  
  // Get user permissions
  const [userRows] = await pool.execute(
    'SELECT IsDeveloper, IsSupport, IsManager, isAdmin FROM Users WHERE Id = ?',
    [userId]
  );
  
  if (!userRows[0].isAdmin) {
    // Check role permissions
    const permissions = await getUserPermissions(token, userId);
    
    if (!permissions.canCreateProjects) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }
  }
  
  // Proceed with project creation
});
```

## Permission Combination Rules

1. **Admin Override**: Users with `isAdmin = true` have ALL permissions
2. **Multiple Roles**: Users can have multiple roles (Developer + Support + Manager)
3. **Permission Union**: If ANY role grants a permission, the user has it
4. **No Roles**: Users with no roles have NO permissions

### Examples

**User with Developer + Support:**
- Has all Developer permissions OR Support permissions
- Example: Can assign tasks (from Support) even though Developer can't

**User with Manager:**
- Has all permissions

**User with no roles:**
- No permissions (can only view what's publicly accessible)

## Managing Permissions

### Via Administration UI

1. Go to **Administration** → **Role Permissions**
2. Select a role (Developer, Support, Manager)
3. Toggle permissions on/off
4. Click **Save Changes**

### Programmatically

```typescript
import { updateRolePermission } from '@/lib/api/rolePermissions';

await updateRolePermission(token, 'Developer', {
  canViewDashboard: true,
  canCreateProjects: false,
  // ... other permissions
});
```

## API Endpoints

- `GET /api/role-permissions` - List all role permissions
- `GET /api/role-permissions/:roleName` - Get specific role permissions
- `PUT /api/role-permissions/:roleName` - Update role permissions
- `GET /api/role-permissions/user/:userId` - Get user's combined permissions

## Best Practices

1. **Always check permissions in UI** before showing action buttons
2. **Always validate permissions on backend** before performing actions
3. **Use PermissionsContext** for reactive permission checks
4. **Default to least privilege** when creating new permission types
5. **Document permission requirements** for new features
6. **Test with different role combinations**

## Troubleshooting

### Permissions not updating
- Check if RolePermissions table has data
- Verify user has correct role flags (IsDeveloper, IsSupport, IsManager)
- Clear browser cache / reload page

### User can't access feature
- Check if user has any roles assigned
- Verify role has required permission in RolePermissions table
- Confirm feature checks correct permission field

### Admin can't do something
- Admins should bypass all permission checks
- Verify `isAdmin = 1` in Users table
- Check if feature explicitly checks isAdmin flag

## Future Enhancements

- [ ] Organization-level permission overrides
- [ ] Custom roles beyond Developer/Support/Manager
- [ ] Permission templates
- [ ] Audit logging for permission changes
- [ ] Time-limited permissions
