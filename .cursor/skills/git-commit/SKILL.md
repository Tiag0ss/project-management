---
name: git-commit
description: >-
  Create a git commit from the current diff with a clear message and no secrets.
  Use when the user asks to commit, stage and commit, or write a commit message.
---

# Git commit

1. Run in parallel: `git status`, `git diff` (staged + unstaged), `git log -5 --oneline`.
2. Do not commit `.env`, credentials, or secret files. Warn if the user asks to include them.
3. Stage only relevant files. Follow the repo’s recent commit message style.
4. Prefer a short message focused on **why** / the real product or behavior change, then commit via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
Short summary of why.

EOF
)"
```

**Message focus (mandatory):**
- Lead with the actual feature, fix, or UX/behavior change in the diff.
- Do **not** center the message on “add unit tests” / “add tests” when those tests only cover the real change.
- Mention tests only when the commit is *primarily* test-only, or as a brief secondary clause if useful.
- Example: prefer `Add sidebar menu visibility prefs per user` over `Add unit tests for nav menu visibility`.

5. Run `git status` after. Do not push unless asked. Do not amend unless the user requested it and safety rules allow.
6. Never skip hooks (`--no-verify`) unless the user explicitly asks.
