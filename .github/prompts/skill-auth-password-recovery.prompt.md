````prompt
# Skill: Auth Password Recovery Flow

## Goal
Implement or modify forgot-password and reset-password functionality with secure token handling, privacy-safe responses, and consistent frontend/backend behavior.

## Task Input

```text
Requested change:
Affected pages/components:
Affected auth routes:
Token rules (expiry, single-use):
Email behavior requirements:
Out of scope:
```

## Execution Rules

1. Keep forgot-password response generic (never reveal whether account/email exists).
2. Generate cryptographically secure reset tokens and store only token hashes in database.
3. Enforce token expiry and single-use semantics.
4. Validate reset token before allowing password update.
5. Hash new password with bcrypt before saving.
6. Invalidate any remaining active reset tokens for the same user after successful reset.
7. Keep SMTP usage through existing email service utilities.
8. Frontend flow should include:
   - login page entry point (forgot-password link),
   - forgot-password request page,
   - reset-password page using token from URL.
9. Use clear loading/error/success states; never use browser `alert()`/`confirm()`.
10. If admin SMTP settings are touched, preserve project rule: empty `smtpPassword` save clears stored password and API returns empty value for hidden secrets.
11. Keep SQL portable for MySQL + MSSQL; avoid MySQL-only interval arithmetic in route SQL.

## Output Contract

- Implement changes directly.
- Summarize:
  - files updated,
  - security guarantees enforced,
  - validation/build checks run.

````
