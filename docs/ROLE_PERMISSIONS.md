# Role Permissions System

## Overview

The Role Permissions system allows fine-grained control over what users can do in the application based on their assigned roles (Developer, Support, Manager).

## Architecture

### Permission Types

Default permissions are defined in [`server/database/structure/systemtables/RolePermissions.json`](../server/database/structure/systemtables/RolePermissions.json) and **automatically seeded** when the server starts for the first time.

**Default permission matrix (summary):**

| Role | Typical capabilities |
|------|---------------------|
| **Developer** | Manage time entries, manage tickets |
| **Support** | View dashboard, manage/create/assign tickets |
| **Manager** | All permissions |

### Frontend Usage

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

### Backend Validation

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
2. **Multiple Roles**: Users can have multiple role flags (`IsDeveloper + IsSupport + IsManager`)
3. **Permission Union**: If ANY role grants a permission, the user has it (OR logic)
4. **No Roles**: Users with no role flags have no permissions and cannot access protected pages
5. **Budget visibility**: `canViewBudgetInfo` is `TRUE` if either the role permission OR the org permission group allows it

### Examples

**User with Developer + Support:**
- Has all Developer permissions OR Support permissions
- Example: Can assign tasks (from Support) even though Developer can't

**User with Manager:**
- Has all permissions

**User with no roles:**
- No permissions (cannot access any protected feature)

## Organization Permission Groups

Organizations can define `PermissionGroups` that are assigned per member, providing **org-scoped overrides** in addition to global role permissions.

### Group-Level Capabilities

| Field | Description |
|---|---|
| `CanManageProjects` | Edit/delete projects within this org |
| `CanManageTasks` | Edit/delete tasks within this org |
| `CanManageMembers` | Add/remove org members and change their roles |
| `CanManageSettings` | Change org-level settings and custom statuses |
| `CanViewBudgetInfo` | See budget and cost data for this org's projects |

### How Groups Apply

- Effective permission = `rolePermission OR groupPermission`
- Groups **never reduce** permissions: if the role grants access, the group cannot revoke it
- Groups are **org-scoped** — only apply within the organization they belong to
- A user in two orgs can have different permission groups in each

### Setup

1. Go to Organization detail page → Settings tab
2. Scroll to "Permission Groups" section
3. Click "Create Permission Group"
4. Enter group name and toggle the desired capabilities
5. When adding/editing a member, select their permission group from the dropdown

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

## Feature-Specific Permission Notes

- **Planning and split allocations** require planning visibility plus task/project management capabilities according to role and org permission group.
- **Jira integration actions** (configure integration, import/sync workflows, check status) should be treated as organization/project management operations and restricted to users with the corresponding management access.
- **Global project edits** (toggling `IsGlobal`, customer association rules) should be limited to users allowed to create/manage projects.
- **Active timers** are user-scoped runtime actions; users can only manage their own active timer context.

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

- [ ] Custom roles beyond Developer / Support / Manager
- [ ] Permission templates for quick group setup
- [ ] Audit logging for permission changes in the Admin UI
- [ ] Time-limited permissions (e.g., temporary elevated access)
