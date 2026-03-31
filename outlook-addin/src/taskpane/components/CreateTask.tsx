import React, { useState, useEffect, useCallback } from 'react';
import {
  getOrganizations,
  getProjects,
  getTaskStatuses,
  getTaskPriorities,
  getOrgUsers,
  createTask,
  Organization,
  Project,
  TaskStatus,
  TaskPriority,
  OrgUser,
} from '../../utils/api';

interface EmailContext {
  subject: string;
  senderEmail: string;
  senderName: string;
  bodyPreview: string;
  receivedDate: string;
}

interface CreateTaskProps {
  emailContext: EmailContext | null;
  onTaskCreated: (taskName: string) => void;
}

export default function CreateTask({ emailContext, onTaskCreated }: CreateTaskProps) {
  // Organization & project selection
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);

  const [selectedOrgId, setSelectedOrgId] = useState<number | ''>('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('');

  // Task form fields
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState<number | ''>('');
  const [priorityId, setPriorityId] = useState<number | ''>('');
  const [assignedTo, setAssignedTo] = useState<number | ''>('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  // UI state
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill from email context
  useEffect(() => {
    if (emailContext) {
      setTaskName(emailContext.subject || '');
      const descParts: string[] = [];
      if (emailContext.senderName || emailContext.senderEmail) {
        descParts.push(`From: ${emailContext.senderName ? `${emailContext.senderName} <${emailContext.senderEmail}>` : emailContext.senderEmail}`);
      }
      if (emailContext.receivedDate) {
        descParts.push(`Date: ${emailContext.receivedDate}`);
      }
      if (emailContext.bodyPreview) {
        descParts.push('', emailContext.bodyPreview);
      }
      setDescription(descParts.join('\n').trim());
    }
  }, [emailContext]);

  // Load organizations on mount
  useEffect(() => {
    setIsLoadingOrgs(true);
    getOrganizations()
      .then(orgs => {
        setOrganizations(orgs);
        if (orgs.length === 1) {
          // Auto-select if only one org
          setSelectedOrgId(orgs[0].Id);
        }
      })
      .catch(err => setError(err.message || 'Failed to load organizations'))
      .finally(() => setIsLoadingOrgs(false));
  }, []);

  // When org changes: load projects, statuses, priorities, users
  const loadOrgData = useCallback(async (orgId: number) => {
    setIsLoadingProject(true);
    setSelectedProjectId('');
    setStatusId('');
    setPriorityId('');
    setAssignedTo('');
    setProjects([]);
    setStatuses([]);
    setPriorities([]);
    setUsers([]);
    setError('');

    try {
      const [projs, stats, prios, orgUsers] = await Promise.all([
        getProjects(orgId),
        getTaskStatuses(orgId),
        getTaskPriorities(orgId),
        getOrgUsers(orgId),
      ]);

      setProjects(projs);
      setStatuses(stats);
      setPriorities(prios);
      setUsers(orgUsers);

      // Pre-select defaults
      const defaultStatus = stats.find(s => s.IsDefault);
      if (defaultStatus) setStatusId(defaultStatus.Id);

      const defaultPriority = prios.find(p => p.IsDefault);
      if (defaultPriority) setPriorityId(defaultPriority.Id);

      // Try to match sender email to a user
      if (emailContext?.senderEmail) {
        const matchedUser = orgUsers.find(
          u => u.Email?.toLowerCase() === emailContext.senderEmail.toLowerCase()
        );
        if (matchedUser) setAssignedTo(matchedUser.Id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load organization data');
    } finally {
      setIsLoadingProject(false);
    }
  }, [emailContext]);

  useEffect(() => {
    if (selectedOrgId !== '') {
      loadOrgData(Number(selectedOrgId));
    }
  }, [selectedOrgId, loadOrgData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedProjectId) {
      setError('Please select a project.');
      return;
    }
    if (!taskName.trim()) {
      setError('Task name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createTask({
        projectId: Number(selectedProjectId),
        taskName: taskName.trim(),
        description: description.trim() || undefined,
        status: statusId !== '' ? Number(statusId) : null,
        priority: priorityId !== '' ? Number(priorityId) : null,
        assignedTo: assignedTo !== '' ? Number(assignedTo) : null,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        plannedStartDate: startDate || null,
        plannedEndDate: dueDate || null,
      });
      onTaskCreated(result.taskName);
    } catch (err: any) {
      setError(err.message || 'Failed to create task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingOrgs) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
        <div className="spinner spinner-dark" style={{ margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13 }}>Loading organizations...</p>
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className="alert alert-warning">
        No organizations found. Make sure your account belongs to at least one organization.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Email context badge */}
      {emailContext && (
        <div className="email-context">
          <div className="email-from">{emailContext.senderName || emailContext.senderEmail}</div>
          <div className="email-subject">{emailContext.subject}</div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {/* Organization */}
      <div className="field">
        <label className="field-label">Organization *</label>
        <select
          value={selectedOrgId}
          onChange={e => setSelectedOrgId(e.target.value !== '' ? Number(e.target.value) : '')}
          disabled={isLoadingProject}
        >
          <option value="">— Select organization —</option>
          {organizations.map(org => (
            <option key={org.Id} value={org.Id}>{org.Name}</option>
          ))}
        </select>
      </div>

      {/* Project */}
      {selectedOrgId !== '' && (
        <div className="field">
          <label className="field-label">Project *</label>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value !== '' ? Number(e.target.value) : '')}
            disabled={isLoadingProject || projects.length === 0}
          >
            <option value="">
              {isLoadingProject ? 'Loading...' : projects.length === 0 ? 'No projects available' : '— Select project —'}
            </option>
            {projects.map(p => (
              <option key={p.Id} value={p.Id}>{p.ProjectName}</option>
            ))}
          </select>
        </div>
      )}

      {selectedProjectId !== '' && (
        <>
          <hr className="divider" />

          {/* Task Name */}
          <div className="field">
            <label className="field-label">Task Name *</label>
            <input
              type="text"
              value={taskName}
              onChange={e => setTaskName(e.target.value)}
              placeholder="Enter task name"
              maxLength={500}
            />
          </div>

          {/* Status & Priority (side by side) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label className="field-label">Status</label>
              <select
                value={statusId}
                onChange={e => setStatusId(e.target.value !== '' ? Number(e.target.value) : '')}
              >
                <option value="">— None —</option>
                {statuses.map(s => (
                  <option key={s.Id} value={s.Id}>{s.StatusName}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Priority</label>
              <select
                value={priorityId}
                onChange={e => setPriorityId(e.target.value !== '' ? Number(e.target.value) : '')}
              >
                <option value="">— None —</option>
                {priorities.map(p => (
                  <option key={p.Id} value={p.Id}>{p.PriorityName}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee */}
          <div className="field">
            <label className="field-label">Assignee</label>
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value !== '' ? Number(e.target.value) : '')}
            >
              <option value="">— Unassigned —</option>
              {users.map(u => (
                <option key={u.Id} value={u.Id}>
                  {u.FirstName && u.LastName ? `${u.FirstName} ${u.LastName}` : u.Username}
                  {u.Email ? ` (${u.Email})` : ''}
                </option>
              ))}
            </select>
            {emailContext?.senderEmail && (
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                Sender: {emailContext.senderEmail}
                {users.find(u => u.Email?.toLowerCase() === emailContext.senderEmail.toLowerCase())
                  ? ' ✓ matched'
                  : ' — no match found'}
              </p>
            )}
          </div>

          {/* Dates & estimated hours */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="field">
              <label className="field-label">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Est. Hours</label>
              <input
                type="text"
                value={estimatedHours}
                onChange={e => setEstimatedHours(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
              />
            </div>
          </div>

          {/* Description */}
          <div className="field">
            <label className="field-label">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              placeholder="Task description (pre-filled from email body)"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={isSubmitting || !taskName.trim()}
          >
            {isSubmitting ? <span className="spinner" /> : null}
            {isSubmitting ? 'Creating Task...' : 'Create Task'}
          </button>
        </>
      )}
    </form>
  );
}
