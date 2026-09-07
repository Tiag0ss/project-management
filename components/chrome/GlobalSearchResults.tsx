'use client';

export type GlobalSearchResultsData = {
  total: number;
  tasks?: Array<{
    Id: number;
    TaskName: string;
    ProjectId?: number;
    ProjectName?: string;
    StatusName?: string;
  }>;
  tickets?: Array<{
    Id: number;
    TicketNumber?: string;
    Title: string;
    ProjectName?: string;
    OrganizationName?: string;
    StatusName?: string;
  }>;
  projects?: Array<{
    Id: number;
    ProjectName: string;
    OrganizationName?: string;
    StatusName?: string;
  }>;
  organizations?: Array<{
    Id: number;
    Name: string;
    Description?: string;
  }>;
  users?: Array<{
    Id: number;
    FirstName: string;
    LastName: string;
    Username: string;
    Email?: string;
  }>;
};

export type GlobalSearchResultClick = (
  type: 'task' | 'ticket' | 'project' | 'organization' | 'user',
  id: number,
  extra?: { ProjectId?: number }
) => void;

type GlobalSearchResultsProps = {
  results: GlobalSearchResultsData;
  onResultClick: GlobalSearchResultClick;
  internalTicketsEnabled: boolean;
  /** Current search query — used in the empty state message. */
  query?: string;
  isSearching?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
};

export default function GlobalSearchResults({
  results,
  onResultClick,
  internalTicketsEnabled,
  query = '',
  isSearching = false,
  hasMore = false,
  onLoadMore,
}: GlobalSearchResultsProps) {
  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto z-50">
      {results.total === 0 ? (
        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
          No results found for &quot;{query}&quot;
        </div>
      ) : (
        <div className="p-2">
          {hasMore && onLoadMore && (
            <div className="border-b border-gray-200 dark:border-gray-700 pb-2 mb-2 flex justify-end">
              <button
                type="button"
                disabled={isSearching}
                onClick={onLoadMore}
                className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 disabled:opacity-50"
              >
                {isSearching ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}

          {results.tasks && results.tasks.length > 0 && (
            <div className="mb-3">
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Tasks ({results.tasks.length})
              </div>
              {results.tasks.map((task) => (
                <button
                  type="button"
                  key={`task-${task.Id}`}
                  onClick={() => onResultClick('task', task.Id, { ProjectId: task.ProjectId })}
                  aria-label={`Open task ${task.TaskName}`}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                >
                  <span className="text-lg">📋</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {task.TaskName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {task.ProjectName} • {task.StatusName || 'Unknown'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {internalTicketsEnabled && results.tickets && results.tickets.length > 0 && (
            <div className="mb-3">
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Tickets ({results.tickets.length})
              </div>
              {results.tickets.map((ticket) => (
                <button
                  type="button"
                  key={`ticket-${ticket.Id}`}
                  onClick={() => onResultClick('ticket', ticket.Id)}
                  aria-label={`Open ticket ${ticket.Title}`}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                >
                  <span className="text-lg">🎫</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {ticket.TicketNumber ? `${ticket.TicketNumber} • ` : ''}
                      {ticket.Title}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {ticket.ProjectName || ticket.OrganizationName} • {ticket.StatusName || 'Unknown'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.projects && results.projects.length > 0 && (
            <div className="mb-3">
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Projects ({results.projects.length})
              </div>
              {results.projects.map((project) => (
                <button
                  type="button"
                  key={`project-${project.Id}`}
                  onClick={() => onResultClick('project', project.Id)}
                  aria-label={`Open project ${project.ProjectName}`}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                >
                  <span className="text-lg">📁</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {project.ProjectName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {project.OrganizationName} • {project.StatusName || 'Unknown'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.organizations && results.organizations.length > 0 && (
            <div className="mb-3">
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Organizations ({results.organizations.length})
              </div>
              {results.organizations.map((org) => (
                <button
                  type="button"
                  key={`org-${org.Id}`}
                  onClick={() => onResultClick('organization', org.Id)}
                  aria-label={`Open organization ${org.Name}`}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                >
                  <span className="text-lg">🏢</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {org.Name}
                    </div>
                    {org.Description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {org.Description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.users && results.users.length > 0 && (
            <div>
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Users ({results.users.length})
              </div>
              {results.users.map((u) => (
                <button
                  type="button"
                  key={`user-${u.Id}`}
                  onClick={() => onResultClick('user', u.Id)}
                  aria-label={`Open user ${u.FirstName} ${u.LastName}`}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                >
                  <span className="text-lg">👤</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {u.FirstName} {u.LastName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      @{u.Username} • {u.Email}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
