'use client';

import { useEffect, useState } from 'react';
import { User, usersApi } from '@/lib/api/users';
import { getApiUrl } from '@/lib/api/config';
import PageTabs from '@/components/PageTabs';
import { SprintPlanningPanel } from '@/components/projects/sprints/SprintPlanningPanel';
import { RetrospectiveActionsPanel } from '@/components/projects/sprints/RetrospectiveActionsPanel';
import type {
  Sprint,
  BacklogTask,
  RetrospectiveActionItem,
  RetrospectiveClosureBySprint,
  VelocityTrendEntry,
  VelocitySummary,
} from '@/components/projects/sprints/types';

export function SprintsTab({ projectId, organizationId, token }: { projectId: number; organizationId: number; token: string }) {
  const API_URL = getApiUrl();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [velocityTrend, setVelocityTrend] = useState<VelocityTrendEntry[]>([]);
  const [velocitySummary, setVelocitySummary] = useState<VelocitySummary | null>(null);
  const [backlog, setBacklog] = useState<BacklogTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrospectiveActions, setRetrospectiveActions] = useState<RetrospectiveActionItem[]>([]);
  const [retrospectiveClosure, setRetrospectiveClosure] = useState<RetrospectiveClosureBySprint[]>([]);
  const [retroUsers, setRetroUsers] = useState<User[]>([]);
  const [sprintsViewTab, setSprintsViewTab] = useState<'sprints' | 'retrospectives'>('sprints');
  const [createSprintSignal, setCreateSprintSignal] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    loadData();
  }, [projectId]);

  useEffect(() => {
    const loadRetroUsers = async () => {
      try {
        const response = await usersApi.getByOrganization(organizationId, token);
        setRetroUsers(response.users || []);
      } catch {
        setRetroUsers([]);
      }
    };

    loadRetroUsers();
  }, [organizationId, token]);

  const loadData = async () => {
    setError('');
    try {
      const [sprintsRes, backlogRes] = await Promise.all([
        fetch(`${API_URL}/api/sprints/project/${projectId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/sprints/project/${projectId}/backlog`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (sprintsRes.ok) setSprints((await sprintsRes.json()).sprints || []);
      if (backlogRes.ok) setBacklog((await backlogRes.json()).tasks || []);

      const trendRes = await fetch(`${API_URL}/api/sprints/project/${projectId}/velocity-trend`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (trendRes.ok) {
        const trendData = await trendRes.json();
        setVelocityTrend(trendData.data?.sprints || []);
        setVelocitySummary(trendData.data?.summary || null);
      }

      const retroRes = await fetch(`${API_URL}/api/retrospective-actions/project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (retroRes.ok) {
        const retroData = await retroRes.json();
        setRetrospectiveActions(retroData.actions || []);
        setRetrospectiveClosure(retroData.closureBySprint || []);
      }
    } catch {
      setError('Failed to load sprint data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading sprints…</div>;

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {sprints.length} sprint{sprints.length !== 1 ? 's' : ''} · {backlog.length} backlog item{backlog.length !== 1 ? 's' : ''}
          </p>
          <div className="min-w-0 flex-1">
            <PageTabs
              tabs={[
                { id: 'sprints', label: 'Sprint Planning' },
                { id: 'retrospectives', label: 'Retrospective Actions' },
              ]}
              activeId={sprintsViewTab}
              onChange={(id) => setSprintsViewTab(id as 'sprints' | 'retrospectives')}
            />
          </div>
        </div>
        {sprintsViewTab === 'sprints' && (
          <button
            onClick={() => setCreateSprintSignal((n) => n + 1)}
            className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            + New Sprint
          </button>
        )}
      </div>

      {sprintsViewTab === 'sprints' && (
        <SprintPlanningPanel
          projectId={projectId}
          token={token}
          sprints={sprints}
          backlog={backlog}
          velocityTrend={velocityTrend}
          velocitySummary={velocitySummary}
          createSprintSignal={createSprintSignal}
          onReload={loadData}
          onError={setError}
        />
      )}

      {sprintsViewTab === 'retrospectives' && (
        <RetrospectiveActionsPanel
          sprints={sprints}
          retrospectiveActions={retrospectiveActions}
          retrospectiveClosure={retrospectiveClosure}
          retroUsers={retroUsers}
          token={token}
          onReload={loadData}
          onError={setError}
        />
      )}
    </div>
  );
}
