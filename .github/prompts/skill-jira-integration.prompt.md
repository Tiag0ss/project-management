# Skill: Jira Integration Flow

## Goal
Implement or update Jira integration behavior across organization settings, project links, tickets, and task Jira references.

## Task Input

```text
Use case:
Scope (org settings / project board / ticket search / task link):
Target files or routes:
Required fields:
Validation rules:
UI behavior expected:
Out of scope:
```

## Execution Rules

1. Respect two-tier Jira model:
   - Jira for Tickets (primary)
   - Jira for Projects (optional separate instance)
2. Show Jira UI fields only when organization integration is enabled/configured.
3. Keep task↔ticket↔jira chain intact:
   - `Tasks.TicketId` → `Tickets.ExternalTicketId` → `OrganizationJiraIntegrations.JiraUrl`
4. For task Jira badges/links:
   - render only when key/url exists,
   - use safe external link attributes.
5. Backend must validate auth and permissions on mutating endpoints.
6. If adding DB fields, update JSON schema files (no migration scripts).
7. Keep API payloads and frontend types aligned.

## Output Contract

- Implement changes directly.
- Summarize:
  - which Jira flow was changed,
  - files/routes updated,
  - how UI gating and link integrity were validated.
