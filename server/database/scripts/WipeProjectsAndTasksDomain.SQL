START TRANSACTION;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `RecurringAllocationOccurrences`;
TRUNCATE TABLE `RecurringAllocations`;

TRUNCATE TABLE `TaskChildAllocations`;
TRUNCATE TABLE `TaskAllocations`;
TRUNCATE TABLE `TaskAllocationHeaders`;

TRUNCATE TABLE `TimeEntries`;
TRUNCATE TABLE `ActiveTimers`;

TRUNCATE TABLE `TaskAssignees`;
TRUNCATE TABLE `TaskAttachments`;
TRUNCATE TABLE `TaskComments`;
TRUNCATE TABLE `TaskChecklists`;
TRUNCATE TABLE `TaskHistory`;
TRUNCATE TABLE `Tasks`;

TRUNCATE TABLE `ProjectAttachments`;
TRUNCATE TABLE `ProjectHistory`;
TRUNCATE TABLE `ProjectMilestones`;
TRUNCATE TABLE `ProjectReportSchedules`;
TRUNCATE TABLE `Sprints`;

TRUNCATE TABLE `ApplicationVersionTasks`;
TRUNCATE TABLE `ApplicationProjects`;

TRUNCATE TABLE `Projects`;

SET FOREIGN_KEY_CHECKS = 1;

COMMIT;
