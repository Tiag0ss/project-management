'use client';

import ChangeHistory from '@/components/ChangeHistory';

export function HistoryTab({ projectId }: { projectId: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <ChangeHistory entityType="project" entityId={projectId} />
    </div>
  );
}
