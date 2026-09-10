import { shouldNotifyTaskAssignee } from '../../server/utils/taskAssignmentNotify';

describe('shouldNotifyTaskAssignee', () => {
  it('notifies a newly added assignee', () => {
    expect(
      shouldNotifyTaskAssignee({ actorUserId: 1, assigneeUserId: 2, alreadyOnTask: false })
    ).toBe(true);
  });

  it('skips self-assignment', () => {
    expect(
      shouldNotifyTaskAssignee({ actorUserId: 2, assigneeUserId: 2, alreadyOnTask: false })
    ).toBe(false);
  });

  it('skips users already on the task', () => {
    expect(
      shouldNotifyTaskAssignee({ actorUserId: 1, assigneeUserId: 2, alreadyOnTask: true })
    ).toBe(false);
  });
});
