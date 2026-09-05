---
name: jira-integration
description: >-
  Implement or update Jira integration across org settings, project links,
  tickets, and task Jira references. Use when changing Jira/GitHub/Gitea-style
  external ticket flows or two-tier Jira configuration.
---

# Skill: Jira Integration Flow

## Goal
Implement or update Jira integration behavior across organization settings, project links, tickets, and task Jira references.

## Placement

- Prefer new/changed API under `server/modules/**`; UI under `app/` and admin/settings components.
- Do not add features under `*/old/**`.
- New domain logic requires unit tests under `__tests__/unit/`.

## Stack notes

- Integrations are **active-org** scoped (`OrganizationJiraIntegrations`).
- Keep SQL portable for **MySQL + MSSQL**; schema changes via JSON only.
- After config/link writes that affect cached reads, invalidate **optional Redis** when applicable.
- UI gating should follow **Synapse theme** / dark-mode patterns already used in settings.

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
8. Add or update unit tests under `__tests__/unit/` for new domain helpers/mappers.

## Related skills

Prefer matching skills under `.cursor/skills/` (e.g. `db-schema-json`, `backend-route`, `permission-gated-ui`).

## Output Contract

- Implement changes directly.
- Summarize:
  - which Jira flow was changed,
  - files/routes updated,
  - how UI gating and link integrity were validated.
