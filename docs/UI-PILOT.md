# Home and Course UI Pilot

## Scope and rollback

- Baseline: `1b02c5f`, tagged `checkpoint/home-courses-before-pilot-20260907`.
- Only home and course catalogue pages. No API, account, payment, or other page changes.
- Home `.promo` markup and styles are protected. Screenshot comparison is part of verification.
- Revert the single pilot commit to undo the trial without resetting unrelated work.

## Local design rules

- Preserve existing Chinese content, blue/white brand and page ordering.
- System Chinese sans-serif; 24px page title, 18px section titles, 15-16px item titles,
  13-14px descriptions, 12px metadata. Pixel type sizes stay readable across phones.
- Touch controls: 44px minimum, natural text wrapping. Radius no more than 8px on new surfaces.
- Main ink #24364f, secondary #5d6e83, interactive blue #3569e8.
- Gold remains reserved for access and reporting. No new bitmap assets or animation dependencies.
- uni-app native swiper, CSS transform/opacity for reveal and press feedback.
- Press 150ms, content reveal 260ms, dialog 280ms, progress entrance 700ms.
- No animation on non-interactive cards. Reduced-motion removes nonessential movement.
- Scope page styles to prevent catalogue selectors from changing the protected home promo.

UI/UX Pro Max guidance was used for touch targets, readable type, focus feedback and
reduced motion. Generic database visual suggestions are not an approved brand redesign.
