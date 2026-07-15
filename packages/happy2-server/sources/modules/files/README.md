# File pipeline

The built-in provider stores committed objects in `files.directory` and keeps
private operational state in dot-directories beneath it:

- `.staging` holds uploads until safety checks and metadata extraction finish.
- `.uploads` holds reconnect-safe resumable manifests and partial data.
- `.quarantine` holds rejected data until the configured retention deadline.
- `.receipts` makes completion retries return the already-created file.
- `.metadata` holds the local quota ledger and cross-process locks.

All file contents, manifests, variants, and metadata files use owner-only file
permissions. A remote/object-store implementation replaces `FileStorageProvider`;
a distributed quota backend replaces `FileQuotaPolicy`. Remote providers still
provide a private local inspection copy so the scanner and `MediaProcessor` can
run before publication.

## Resumable HTTP flow

1. `POST /v0/files/createUpload` with `{ filename, contentType, size }` reserves
   quota and returns an upload ID and offset.
2. `POST /v0/files/:uploadId/appendUpload` sends one multipart file part and an
   `Upload-Offset` header. A stale offset returns `409`, the current offset, and
   an `Upload-Offset` response header.
3. `GET /v0/files/:uploadId/uploadState` recovers the durable offset after a
   reconnect or process restart.
4. `POST /v0/files/:uploadId/completeUpload` scans, inspects, derives previews,
   atomically commits the object, and creates the durable file record.
5. `POST /v0/files/:uploadId/cancelUpload` releases the reservation and partial
   data.

Upload IDs are owner-bound and other users receive `404`. Thumbnail and preview
routes re-run the parent file's authorization check, including chat attachment
privacy, rather than granting variants separate visibility.

## Maintenance

`FileStorage.runMaintenance` is caller-driven so a clustered deployment can run
it under a distributed lease. It expires incomplete uploads and quarantine data.
When passed the complete authoritative set of file records after database
deletions, it also removes orphan objects and reconciles legacy/current quota
usage. `deleteStoredFile` is the targeted hook to call after all durable file
references and the file row have been removed.
