# Account Isolation and Administrator Management

## Login and Identity

- Frontend: http://127.0.0.1:5174/#/pages/login/index
- Admin management: http://127.0.0.1:5180/#administrators
- Roles: http://127.0.0.1:5180/#roles
- Existing initial admin phone/password remain unchanged. Credentials are
  configured in the untracked `.env`, never this document.
- Any syntactically valid 11-digit phone starting with 1 can request a local
  four-digit code. The page displays it; no SMS is sent. Unregistered phones
  create a student account. Existing resend/attempt/IP limits still apply.
- Test-code delivery is disabled in production until SMS is configured.

Schema v4 separates identities by `(phone, account_kind)`. The same phone can
have a student ID and a different admin ID. A shared principal table preserves
existing foreign keys and audit history; it does not share privileges or login
sessions. Student management excludes administrators. Admin sessions cannot
enter student business APIs, and student sessions cannot enter admin APIs.

## Administration

Only `superadmin` (highest administrator) is available in the role view and
account forms. There is no custom-role editor in this release.

Highest admins can search, add, rename, enable/disable administrators, and reset
passwords with a recorded reason. Passwords require 10-128 characters with
letters and digits, are stored as hashes, and never appear in audit payloads.
Admin phone numbers cannot be edited. Disabling accounts is reversible; there
is no destructive delete. The current administrator cannot disable itself and
at least one enabled highest administrator must remain. Disabling or resetting
a password revokes that administrator's sessions, not the same-phone student.

Creation, updates, password resets and admin logins are audited. Test-mode
accounts are marked `is_test_data`. UI verification administrators additionally
carry a test prefix in their display name and are disabled after the run.

## Migration and Rollback

Migration v4 is transactional and idempotent, retains existing IDs/passwords,
and invalidates old backend sessions once. Re-login after upgrading.

Before migration the API was stopped and a consistent local database copy was
saved to `.local/backups/before-accounts-v4-stopped-20260907/database`.
An earlier copy without `stopped` in its name was made while running and must
not be used as the rollback source.

Rolling back UI does not require any database change. Rolling back identity
code to before v4 also requires restoring the matching pre-v4 database while
the API is stopped; old code assumes phone alone is unique. Preserve the
current database separately first, and obtain explicit approval because
restoring the earlier database loses all records created since the backup.

## Verification

`npm test` includes isolated temporary-database tests for same-phone identity
separation, unseeded phone login, authorization boundaries, administrator CRUD,
session revocation, protected active accounts, audit secrecy and repeatable
migration/seed. `npm run check` covers API and admin types. Browser tests are in
`tests/ui-site.mjs`. No Docker, HTTPS certificate, or port 3000 is required for
this local setup.
