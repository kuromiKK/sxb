# Student UI Rollout - 2026-09-07

## Scope

The approved home/course pilot is the baseline, not a new visual direction.
Keep Chinese copy, module order, blue/white branding, compact action buttons,
borderless plan editing, and horizontally scrollable course subjects.

- Shared type tokens: metadata 12px, secondary 13px, body 14px, item 15px,
  title 16px, section 18px, page title 24px, display 28px.
- Home and course experience cards use the same readable title/body hierarchy.
- Apply page-scoped typography across login, knowledge, practice, courses,
  learning plans, articles, notes, profile and its subviews.
- Two knowledge-map components get larger type and matching selector heights.
- Profile service rows get enough vertical space for two lines.
- Monthly long-report text and navigation become readable. Fixed multi-page
  export poster frames and internal typography retain the previously approved
  geometry; they are deliberately not blanket-scaled.
- Press opacity, keyboard focus rings, short dialog/content entrances, and
  reduced-motion overrides. No new animation dependency or image assets.

UI/UX Pro Max informed readable type, wrapping, focus visibility and reduced
motion. Its generic visual recommendations did not override the existing brand.

## Verification

- `node tests/ui-pilot.mjs`: home/course at six widths, compact button faces,
  subject touch swipe, report swipe/actions, style isolation and reduced motion.
- `node tests/ui-site.mjs`: 27 routes at 375/430/1517px, both map modes,
  tiny-text/page-overflow checks, real frontend phone login, admin list/create/
  disable controls and role view. Test accounts are marked test data and test
  administrators are disabled after verification.
- `npm run type-check --prefix apps/user`
- `npm run build:mp-weixin --prefix apps/user`
- Screenshots/results are local only: `.local/qa/site` and `.local/qa/pilot`.
- Mini-program compilation is not a substitute for WeChat device testing.

## Rollback

Starting checkpoint: `checkpoint/before-site-ui-admin-20260907` (`bc553eb`).
UI and account changes are committed separately. Revert only the UI commit to
undo the visual rollout without undoing account isolation or changing data.
Do not reset the whole workspace. Database rollback has separate requirements
documented in `ACCOUNT-MANAGEMENT.md`.
