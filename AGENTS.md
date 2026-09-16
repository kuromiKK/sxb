# Resource uploads

All new or changed features that persist uploaded images, videos, audio, or attachments must use the registered resource pipeline. See `docs/RESOURCE-UPLOADS.md`.

- Use `apps/admin/src/utils/upload-resource.ts` and the existing upload components. Upload files through `/api/admin/media/upload`; do not persist new Base64/data URLs in business records.
- Store the returned asset ID (protected media) or the public image URL (public covers/illustrations). Do not expose course videos, audio, or paid attachments through a public image/file route.
- When adding a content owner or snapshot table, add its references to `apps/api/src/resource-index.ts`, its navigation target to resource management, and validation under `lockResourceReferences` before saving. Preserve references from restorable versions and orders.
- Verify upload registration, original filename/size/time, preview, reference navigation, and deletion protection. Temporary spreadsheet imports are parsing inputs, not published media assets.
