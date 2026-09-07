'use client';

import React from 'react';

export function TasksToolbar({
  canCreate,
  showImportDropdown,
  setShowImportDropdown,
  showCheckStatusDropdown,
  setShowCheckStatusDropdown,
  showTemplateDropdown,
  setShowTemplateDropdown,
  setShowTemplateSaveModal,
  setShowTemplateApplyModal,
  hasJiraBoardIntegration,
  hasJiraTicketIntegration,
  hasTaskStatusCheckOption,
  hasGitHubIntegration,
  hasGiteaIntegration,
  hasOutlookQueueItems,
  onImportClick,
  onImportFromJira,
  onImportFromJiraTicket,
  onImportFromOutlookQueue,
  onImportFromGitHub,
  onImportFromGitea,
  onCheckJiraTicketStatus,
  onCheckJiraBoardStatus,
  onCreateTask,
}: {
  canCreate: boolean;
  showImportDropdown: boolean;
  setShowImportDropdown: (value: boolean | ((prev: boolean) => boolean)) => void;
  showCheckStatusDropdown: boolean;
  setShowCheckStatusDropdown: (value: boolean | ((prev: boolean) => boolean)) => void;
  showTemplateDropdown: boolean;
  setShowTemplateDropdown: (value: boolean | ((prev: boolean) => boolean)) => void;
  setShowTemplateSaveModal: (value: boolean) => void;
  setShowTemplateApplyModal: (value: boolean) => void;
  hasJiraBoardIntegration: boolean;
  hasJiraTicketIntegration: boolean;
  hasTaskStatusCheckOption: boolean;
  hasGitHubIntegration: boolean;
  hasGiteaIntegration: boolean;
  hasOutlookQueueItems: boolean;
  onImportClick: () => void;
  onImportFromJira: () => void;
  onImportFromJiraTicket: () => void;
  onImportFromOutlookQueue: () => void;
  onImportFromGitHub: () => void;
  onImportFromGitea: () => void;
  onCheckJiraTicketStatus?: () => void;
  onCheckJiraBoardStatus?: () => void;
  onCreateTask: () => void;
}) {
  return (
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-2">
        <div className="flex max-w-full flex-wrap gap-2">
          {canCreate && (
            <>
              {/* Import Dropdown - always visible, CSV always available */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowImportDropdown(!showImportDropdown);
                    setShowCheckStatusDropdown(false);
                  }}
                  className="h-10 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
                >
                  <span className="text-base leading-none">📥</span>
                  Import Tasks
                  <svg className={`w-4 h-4 transition-transform ${showImportDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showImportDropdown && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <div className="fixed inset-0 z-10" onClick={() => setShowImportDropdown(false)}></div>
                    
                    {/* Dropdown menu */}
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20">
                      <div className="py-2">
                        {/* CSV Import - always available */}
                        <button
                          onClick={() => {
                            onImportClick();
                            setShowImportDropdown(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                        >
                          <span className="text-xl">📥</span>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">Import CSV</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Upload tasks from file</div>
                          </div>
                        </button>
                        
                        {/* Jira Import - only if configured */}
                        {hasJiraBoardIntegration && (
                          <button
                            onClick={() => {
                              onImportFromJira();
                              setShowImportDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                          >
                            <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                            </svg>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">Import from Jira</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Sync Jira issues</div>
                            </div>
                          </button>
                        )}
                        
                        {/* Jira Ticket Import - only if Jira Tickets integration is configured */}
                        {hasJiraTicketIntegration && (
                          <button
                            onClick={() => {
                              onImportFromJiraTicket();
                              setShowImportDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                          >
                            <span className="text-xl">🎫</span>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">Import from Jira Ticket</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Tickets import</div>
                            </div>
                          </button>
                        )}

                        {hasOutlookQueueItems && (
                          <button
                            onClick={() => {
                              onImportFromOutlookQueue();
                              setShowImportDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                          >
                            <span className="text-xl">📧</span>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">Import from Outlook Queue</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Emails sent to the queue address</div>
                            </div>
                          </button>
                        )}
                        
                        {/* GitHub Import - only if configured */}
                        {hasGitHubIntegration && (
                          <button
                            onClick={() => {
                              onImportFromGitHub();
                              setShowImportDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                          >
                            <svg className="w-5 h-5 text-gray-800 dark:text-gray-200" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">Import from GitHub</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Sync GitHub issues</div>
                            </div>
                          </button>
                        )}
                        
                        {/* Gitea Import - only if configured */}
                        {hasGiteaIntegration && (
                          <button
                            onClick={() => {
                              onImportFromGitea();
                              setShowImportDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                          >
                            <span className="text-xl">🍵</span>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">Import from Gitea</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Sync Gitea issues</div>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {hasTaskStatusCheckOption && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowCheckStatusDropdown(!showCheckStatusDropdown);
                      setShowImportDropdown(false);
                    }}
                    className="h-10 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
                  >
                    <span className="text-base leading-none">🔍</span>
                    Check Task Status
                    <svg className={`w-4 h-4 transition-transform ${showCheckStatusDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showCheckStatusDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowCheckStatusDropdown(false)}></div>
                      <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20">
                        <div className="py-2">
                          {hasJiraTicketIntegration && onCheckJiraTicketStatus && (
                            <button
                              onClick={() => {
                                onCheckJiraTicketStatus();
                                setShowCheckStatusDropdown(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                            >
                              <span className="text-xl">🎫</span>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">Check Jira Ticket Status</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Detect ticket status changes</div>
                              </div>
                            </button>
                          )}

                          {hasJiraBoardIntegration && onCheckJiraBoardStatus && (
                            <button
                              onClick={() => {
                                onCheckJiraBoardStatus();
                                setShowCheckStatusDropdown(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                            >
                              <span className="text-xl">📌</span>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">Check Jira Board Status</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Detect board status changes</div>
                              </div>
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              
              <button
                onClick={onCreateTask}
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <span className="text-base leading-none">+</span>
                New Task
              </button>
              {/* Template Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                  className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
                >
                  <span className="text-base leading-none">📋</span>
                  Templates
                  <svg className={`w-4 h-4 transition-transform ${showTemplateDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTemplateDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowTemplateDropdown(false)}></div>
                    <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20">
                      <div className="py-2">
                        <button
                          onClick={() => { setShowTemplateApplyModal(true); setShowTemplateDropdown(false); }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                        >
                          <span className="text-lg">📥</span>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white text-sm">Apply Template</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Create tasks from a template</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setShowTemplateSaveModal(true); setShowTemplateDropdown(false); }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                        >
                          <span className="text-lg">💾</span>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white text-sm">Save as Template</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Save these tasks as reusable template</div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

  );
}
