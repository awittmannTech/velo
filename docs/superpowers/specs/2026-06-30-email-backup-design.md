# Email Backup / Export — Design Note

## Goal
Let the user back up / export their mail to disk — everything, or filtered by
label / sender / date range / search query. Output is durable and portable.

## Scope & honest limitations (v1)
- **Source of truth = the local SQLite cache.** Velo only syncs ~365 days of mail
  (`sync_period_days`, default 365). A backup therefore covers *locally-synced*
  mail by default. Older mail that was never synced is **not** on disk and will
  **not** be in the backup. The UI states this clearly.
- **Optional higher-fidelity fetch (Gmail only).** For `gmail_api` accounts the
  user can tick "Fetch full original from Gmail". For each message we then call
  `GmailClient.getMessage(id, "raw")` and write the verbatim RFC822 the server
  returns (base64url-decoded). This preserves *all* original headers and
  attachments. It is slower and online-only, and still only covers messages that
  exist in the local index (i.e. it raises fidelity, not date coverage). IMAP
  accounts always use the reconstructed path.
- **Read-only / non-destructive.** Backup never mutates mail or the DB.

## Output format
**One `.eml` (RFC822) file per message**, inside a single dated folder:

```
<chosen-folder>/velo-backup-<email>-<YYYYMMDD-HHMMSS>/
  manifest.json
  20240115-123045_Subject_<shortid>.eml
  ...
```

Rationale: `.eml` is the most portable single-message format — openable by Apple
Mail, Outlook, Thunderbird, etc., and re-importable. One-file-per-message keeps
the export resumable-in-spirit, greppable, and avoids a giant opaque blob. (An
`.mbox` single file was considered; per-file `.eml` is friendlier for partial
recovery and matches the app's existing single-thread `.eml` export in
`ThreadView.tsx`.)

- **Reconstructed `.eml`** (default path): built from stored columns —
  From/To/Cc/Bcc/Reply-To/Subject/Date/Message-ID/In-Reply-To/References headers
  plus a `multipart/alternative` body when both `body_text` and `body_html`
  exist (single part otherwise). Cached attachments are **not** embedded in v1
  (documented); use the Gmail raw path for attachment fidelity.
- **Raw `.eml`** (opt-in, Gmail): the server's exact bytes.

A `manifest.json` records account, scope, counts, timestamp, mode, and the
limitation note.

## Filters
Reuses the existing search stack. A `BackupScope` union →
`scopeToQuerySpec()` → `buildBackupQuery()` (parameterised SQL over `messages`).
- Everything (account-wide)
- Label (system or user label, via the same `thread_labels`/`labels` EXISTS join as search)
- Sender (`from:`)
- Date range (date pickers → `m.date` between, **milliseconds** — note `messages.date` is Unix ms)
- Search query (full Gmail-style operator string via `parseSearchQuery`)

`buildBackupCountQuery()` powers the live "N messages match" preview before
running.

## Where it lives
Dedicated route `/backup` + sidebar nav item (mirrors `/attachments`,
`/tasks`). The page has: scope picker, destination-folder picker
(`dialog.open({ directory: true })`), preview count, optional Gmail-raw toggle,
a progress bar during the run, and a completion toast with "Open folder".

## Module layout (`src/services/backup/`)
- `emlBuilder.ts` — **pure**: `buildEml(msg)`, `sanitizeFilename()`,
  `emlFilename(msg)`, `base64UrlToBytes()`. Unit-tested.
- `backupQuery.ts` — **pure**: `scopeToQuerySpec()`, `buildBackupQuery()`,
  `buildBackupCountQuery()`. Unit-tested.
- `backupService.ts` — **impure** orchestrator: `countBackup()`, `runBackup()`
  (query → serialize → write via `@tauri-apps/plugin-fs`), progress + cancel.

## Capability additions (required)
`src-tauri/capabilities/default.json`:
- `dialog:allow-open` — folder picker (note: `dialog:default` already includes
  open on most builds; added explicitly to be safe).
- Broaden `fs:scope` to allow writing the user-chosen destination. The existing
  scope is `$APPDATA` only. Added `$HOME` + `$HOME/**` so exports can be written
  under the user's home directory. (A stricter alternative is a dedicated Rust
  `write_backup_file` command that bypasses the JS fs scope; chosen the scope
  broadening to keep v1 pure-frontend and testable. Flagged for review.)
