# Registered uploads

Images, videos, audio, and attachments uploaded for persisted content all use `POST /api/admin/media/upload`. The file is validated by actual MIME type, stored on disk, and registered in `media_assets` with its original filename, size, uploader, creation time, and content owner. Registration and its audit log commit together. Failed registration removes the temporary disk file.

## Frontend integration

Use `uploadResource(file, { kind, contentId, examId, onProgress })` from `apps/admin/src/utils/upload-resource.ts`. The return value provides `promise` and `abort()`. Await successful registration before attaching the asset to a form; abort when unmounting. A successfully uploaded file from a cancelled form remains an unreferenced resource that can be inspected and cleaned up.

- `CoverImagePicker` requires `contentId`. Public product, exam and category covers use registered public image URLs. The existing `/api/message-images/:id` URL supports these public images as well as message illustrations.
- `CourseAssetPicker`, `RichEditor`, and `KnowledgeHandouts` use the same uploader. Protected course media and attachments keep asset IDs and require authenticated access/tickets. No changes to paid media authorization are implied by registration.
- External links remain external; do not claim they are uploaded server files. Spreadsheet imports are temporary parsing inputs, not media resources.

## Reference lifecycle

`resourceInventory` discovers references in saved content, current products, product versions, order snapshots, exam/category covers, exam guides, and messages. Upload ownership alone is not a saved reference. Resource cleanup rechecks references under the same transaction lock used by content saves. Every new persisted resource field or snapshot owner must extend this index and the resource location navigation.

## Legacy images

Migration 19 registers existing embedded images on disk and stores `legacy_image_hash` to map unchanged historical data URLs to those files. Current product/exam/category covers switch to public URLs. Product versions and order snapshots are not rewritten. Restoring an old cover resolves its registered URL. Existing original filenames and upload times cannot be reconstructed: migrated filenames use the reference title/location and the resource UI shows the upload time as unrecorded. Database and media files must be backed up together.
