'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import InstallAppPrompt from '@/components/InstallAppPrompt';
import { useColorVision } from '@/hooks/useColorVision';
import { formatTicketCreatorLabel, formatTicketRef } from '@/lib/customerPortal';

export type CustomerPortalTicket = {
  Id: number;
  TicketNumber?: string | null;
  Title: string;
  Category: string;
  CreatedAt: string;
  UpdatedAt: string;
  StatusName: string;
  StatusType?: string | null;
  StatusColor: string;
  IsClosed: number;
  PriorityName: string;
  PriorityColor: string;
  ProjectName: string | null;
  AssigneeName?: string | null;
  AssigneeFirst?: string | null;
  AssigneeLast?: string | null;
  CreatorUsername?: string | null;
  CreatorFirst?: string | null;
  CreatorLast?: string | null;
  CreatorName?: string | null;
};

export type CustomerPortalProject = {
  Id: number;
  ProjectName: string;
  Description: string | null;
  StatusLabel: string | null;
  StatusColor: string | null;
  OrganizationName: string;
  TotalTasks: number;
  CompletedTasks: number;
  StartDate: string | null;
  EndDate: string | null;
};

export type CustomerPortalData = {
  customer: {
    Id: number;
    Name: string;
    Email: string | null;
    Phone: string | null;
    ContactPerson: string | null;
    ContactEmail: string | null;
    Website: string | null;
  };
  stats: {
    total: number;
    open: number;
    closed: number;
    inProgress: number;
    waiting: number;
    urgent: number;
  };
  attentionTickets: CustomerPortalTicket[];
  recentActivity: CustomerPortalTicket[];
  projects: CustomerPortalProject[];
};

type CustomerPortalDashboardProps = {
  portalData: CustomerPortalData | null;
  portalLoading: boolean;
  portalError: string;
  loadPortalData: () => void;
  internalTicketsEnabled: boolean;
};

export default function CustomerPortalDashboard({
  portalData,
  portalLoading,
  portalError,
  loadPortalData,
  internalTicketsEnabled,
}: CustomerPortalDashboardProps) {
  const router = useRouter();
  const { pillStyle } = useColorVision();

  return (
    <main className="min-h-0 flex-1 overflow-y-auto max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 w-full">
      <div className="px-4 py-6 sm:px-0 space-y-4">
        <InstallAppPrompt />
        {portalLoading ? (
          <div className="space-y-5 animate-pulse">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-24" />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-40" />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-72" />
          </div>
        ) : portalError ? (
          <EmptyState
            icon={<AlertTriangle size={40} strokeWidth={1.5} className="text-[var(--pm-muted)] opacity-70" aria-hidden />}
            title="Unable to load portal data"
            message={portalError}
            primaryAction={{ label: 'Retry', onClick: loadPortalData }}
          />
        ) : portalData ? (
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{portalData.customer.Name}</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                  {portalData.customer.ContactPerson && <span>{portalData.customer.ContactPerson}</span>}
                  {portalData.customer.ContactEmail && (
                    <a href={`mailto:${portalData.customer.ContactEmail}`} className="hover:text-blue-600">
                      {portalData.customer.ContactEmail}
                    </a>
                  )}
                  {portalData.customer.Phone && <span>{portalData.customer.Phone}</span>}
                  {portalData.customer.Website && (
                    <a href={portalData.customer.Website} target="_blank" rel="noreferrer" className="hover:text-blue-600">
                      Website
                    </a>
                  )}
                </div>
              </div>
              {internalTicketsEnabled && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push('/tickets')}
                    className="h-10 px-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    All tickets
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/tickets?new=1')}
                    className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Ticket
                  </button>
                </div>
              )}
            </div>

            {internalTicketsEnabled && (
              <>
                {Number(portalData.stats.waiting) > 0 ? (
                  <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <h2 className="text-lg font-semibold text-amber-950 dark:text-amber-100">
                          Needs your attention
                        </h2>
                        <p className="text-sm text-amber-800/90 dark:text-amber-200/80 mt-1">
                          {Number(portalData.stats.waiting)} ticket{Number(portalData.stats.waiting) === 1 ? '' : 's'} waiting for a customer response.
                          Reply or update these so support can continue.
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {(portalData.attentionTickets || []).map((ticket) => (
                        <li key={ticket.Id}>
                          <button
                            type="button"
                            onClick={() => router.push(`/tickets/${ticket.Id}`)}
                            className="w-full text-left rounded-md border border-amber-200/80 dark:border-amber-800/50 bg-white/80 dark:bg-gray-900/50 px-3 py-3 hover:bg-white dark:hover:bg-gray-900 transition-colors"
                          >
                            <div className="flex flex-wrap items-center gap-2 justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs text-gray-500">{formatTicketRef(ticket)}</span>
                                  <span className="font-medium text-gray-900 dark:text-white line-clamp-1">{ticket.Title}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                  <span
                                    className="px-2 py-0.5 rounded-full font-medium"
                                    style={pillStyle(ticket.StatusColor || '#f59e0b', { alpha: '22' })}
                                  >
                                    {ticket.StatusName}
                                  </span>
                                  {ticket.PriorityName && (
                                    <span
                                      className="px-2 py-0.5 rounded-full font-medium"
                                      style={pillStyle(ticket.PriorityColor || '#888888', { alpha: '22' })}
                                    >
                                      {ticket.PriorityName}
                                    </span>
                                  )}
                                  <span>Opened by {formatTicketCreatorLabel(ticket)}</span>
                                </div>
                              </div>
                              <span className="text-xs text-gray-400 shrink-0">
                                Updated{' '}
                                {new Date(ticket.UpdatedAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
                    No tickets are waiting for your response right now.
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Total', value: portalData.stats.total, color: 'text-gray-900 dark:text-white', bg: 'bg-white dark:bg-gray-800', href: '/tickets' },
                    { label: 'Open', value: portalData.stats.open, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', href: '/tickets' },
                    { label: 'In Progress', value: portalData.stats.inProgress, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/30', href: '/tickets' },
                    {
                      label: 'Needs you',
                      value: portalData.stats.waiting,
                      color: 'text-amber-700 dark:text-amber-300',
                      bg: 'bg-amber-50 dark:bg-amber-900/30',
                      href: '/tickets',
                    },
                    { label: 'Resolved', value: portalData.stats.closed, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', href: '/tickets' },
                    { label: 'Urgent', value: portalData.stats.urgent, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', href: '/tickets' },
                  ].map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => router.push(s.href)}
                      className={`${s.bg} rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-left hover:ring-2 hover:ring-blue-500/30 transition`}
                    >
                      <div className={`text-2xl font-bold ${s.color}`}>{Number(s.value)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</div>
                    </button>
                  ))}
                </div>

                {(portalData.recentActivity || []).length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent updates</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Latest ticket activity (excluding items that already need your reply). Full list is on Tickets.
                        </p>
                      </div>
                      <Link
                        href="/tickets"
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                      >
                        View all
                      </Link>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                      {portalData.recentActivity.map((ticket) => (
                        <button
                          key={ticket.Id}
                          type="button"
                          onClick={() => router.push(`/tickets/${ticket.Id}`)}
                          className="w-full flex flex-wrap items-center gap-2 justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                        >
                          <div className="min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-gray-400">{formatTicketRef(ticket)}</span>
                            <span className="font-medium text-gray-900 dark:text-white line-clamp-1">{ticket.Title}</span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={pillStyle(ticket.StatusColor || '#888888', { alpha: '22' })}
                            >
                              {ticket.StatusName}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">
                            {new Date(ticket.UpdatedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {Number(portalData.stats.total) === 0 && (
                  <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No tickets yet for your account.</p>
                    <button
                      type="button"
                      onClick={() => router.push('/tickets?new=1')}
                      className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                    >
                      New Ticket
                    </button>
                  </div>
                )}
              </>
            )}

            {portalData.projects.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your projects</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {portalData.projects.map((project) => {
                    const pct =
                      project.TotalTasks > 0
                        ? Math.round((Number(project.CompletedTasks) / Number(project.TotalTasks)) * 100)
                        : 0;
                    return (
                      <div
                        key={project.Id}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-gray-900 dark:text-white leading-tight">
                            {project.ProjectName}
                          </div>
                          {project.StatusLabel && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                              style={pillStyle(project.StatusColor || '#888888', { alpha: '22' })}
                            >
                              {project.StatusLabel}
                            </span>
                          )}
                        </div>
                        {project.Description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {project.Description}
                          </p>
                        )}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>
                              {Number(project.CompletedTasks)} / {Number(project.TotalTasks)} tasks done
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        {(project.StartDate || project.EndDate) && (
                          <div className="text-xs text-gray-400 mt-2">
                            {project.StartDate ? String(project.StartDate).split('T')[0] : '?'} —{' '}
                            {project.EndDate ? String(project.EndDate).split('T')[0] : '?'}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">{project.OrganizationName}</div>
                        {internalTicketsEnabled && (
                          <button
                            type="button"
                            onClick={() => router.push('/tickets?new=1')}
                            className="mt-3 h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            New ticket
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {portalData.projects.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-6 text-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No visible projects yet</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  When your provider marks a project as visible to customers, it will appear here with progress.
                </p>
                {internalTicketsEnabled && (
                  <button
                    type="button"
                    onClick={() => router.push('/tickets?new=1')}
                    className="mt-4 h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Open a support ticket
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
