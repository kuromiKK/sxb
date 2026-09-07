# Manual Exam Entitlements

## Local Workflow

Open http://127.0.0.1:5180/#users, search the student's name or phone, then select
`权益管理`. Only registered frontend students appear in this list; an admin
phone must first register on the frontend to have a separate student identity.

1. Select the exam. Current effective rights and original order rights are
   displayed separately, including the 24-hour trial flag for original orders.
2. Choose free, VIP or SVIP and an unexpired exam cycle.
3. Enter a reason and confirm the student, phone, exam and period.
4. Refresh the student frontend to read the updated rights. No logout is needed.
5. Use `恢复订单权益` with a reason to remove the manual override.

Manual assignments take effect immediately until the selected exam ends. SVIP
then becomes VIP until the next exam cycle ends, matching the existing membership
rule. Once the manual period fully expires, effective rights come from orders
again. Exam deadlines remain configurable, and changes to them affect manual
rights as well as purchased rights. If the next cycle is missing, the existing
one-year fallback is used. There is no permanent grant in this release.

The override applies only to one student and one exam. Setting free can override
paid VIP/SVIP without refunding, deleting or modifying any original order. Manual
rights have precedence, including over subsequent payments, until removed or
expired. Restore order rights before validating payment-driven entitlement
changes. This distinction is explicitly shown in the admin dialog.

## Implementation

- Schema v5 adds `manual_entitlements`, one versioned current record per student
  and exam. It does not create fake orders or alter payment totals.
- The central `rights()` resolver applies the manual rule first, then falls back
  to `orderRights()`. All existing protected APIs use the same result.
- Earliest manual paid-tier grant contributes to report membership start dates;
  otherwise a manual-only member would lose their month history over time.
- GET `/api/admin/users/:userId/entitlements?examId=...` returns current/order
  rights, cycles, version and the latest 50 adjustments for that exam.
- PUT `/api/admin/users/:userId/entitlements/:examId` accepts either
  `{action:'set',level,cycleId,version,reason}` or `{action:'restore',version,reason}`.
- Highest-administrator authorization is enforced server-side. Invalid students,
  ended or wrong-exam cycles, unknown tiers and missing reasons are rejected.
- A transaction locks the student's principal row. Expected versions prevent
  stale or concurrent admin actions from silently overwriting another change.
- Every adjustment writes `entitlement.adjust` audit data with actor, exam,
  before/after rights, old/new manual state, reason and timestamp. The dialog
  exposes readable history; the main audit view preserves complete details.

## Verification and Rollback

- `npm test`: isolated database tests cover authorization, switching tiers,
  independent users/exams, order preservation, restore, concurrency, history,
  report access, expiry/downgrade and repeatable migration.
- `npm run check` and `npm run build:admin` verify API/admin compilation.
- `node tests/ui-entitlements.mjs` uses a new test student to exercise real admin
  controls, confirmation/cancel, three tiers, frontend profile/report views,
  history isolation, restoration and desktop/mobile layout. Its cleanup restores
  the test student's order-derived rights even after a failed assertion.
- Browser artifacts are local-only under `.local/qa/entitlements`.
- Starting Git checkpoint: `checkpoint/before-manual-entitlements-20260907`.
- The API was stopped before a consistent pre-v5 database backup was made at
  `.local/backups/before-manual-entitlements-v5-20260907` (database files directly
  in this folder). No existing account rights were changed by migration.
- To retire this feature, restore active manual overrides first, then revert
  this feature's Git commit. The additive table may remain for audit continuity.
  Do not restore an older database without explicit approval: that would discard
  newer user data, not merely undo this feature.

This change does not rename administrators, expose LAN ports, or modify the
student visual design. UI/UX Pro Max was used for validation feedback, explicit
confirmation, existing design consistency and a scrollable small-screen dialog.
