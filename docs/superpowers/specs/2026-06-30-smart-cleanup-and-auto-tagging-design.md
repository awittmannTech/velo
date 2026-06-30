# Smart Cleanup & AI Auto-Tagging — Design Spec

Date: 2026-06-30
Status: Approved (brainstorm) → implementation

## Summary

Two related inbox-organization features, built together:

1. **Smart Cleanup** — a dedicated page to bulk-triage clutter: clutter grouped
   by sender with one-click archive / unsubscribe+archive, age sweeps, and an
   optional "always archive from this sender" standing rule. Archive-not-delete,
   preview counts, single batch Undo.

2. **AI Auto-Tagging** — instead of a fixed taxonomy, the AI builds a *profile*
   of the user from their inbox and proposes a *personalized* tag set tailored
   to their context (key people/orgs, recurring projects/themes) plus a small
   universal baseline. The user reviews every suggestion before it's created;
   approved tags become `smart_label_rules` and are backfilled. A one-time
   **tag cleanup/merge wizard** migrates the user's existing "not useful" tags
   into the new set.

Reuses existing infrastructure heavily: `smart_label_rules` (two-phase
criteria+AI matching), `backfillService`, `unsubscribeManager`, `filterEngine`,
`emailActions`, `followupManager`, `ai_cache`, and the Today `Toast` pattern.

## Design decisions (from brainstorm)

- Build **both together**, sequenced in phases.
- Cleanup = **full Cleanup page** (not just unsubscribe, not just cards).
- Auto-tagging = **AI-profile-driven, personalized** (not a fixed taxonomy).
- **Hybrid** baseline: a couple of universal intent tags + AI-discovered tags.
- **Once + "Suggest more"** cadence (not continuous background suggestion).
- **Always review** before a tag is created (no silent auto-create).
- Existing messy tags → **cleanup/merge wizard**.

## Non-goals (v1)

- Continuous/background tag suggestion (deferred; "Suggest more" button only).
- Auto-create high-confidence tags without review.
- Block-sender with review buffer (SaneBox BlackHole) — deferred.
- Cross-account scope — operate on the active account, like Tasks/Today.

## Shared foundation: batch Undo (`services/cleanup/bulkOps.ts`)

Every bulk mutation (archive-all, sweep, tag-merge) goes through a small helper
that:

1. **Snapshots** the affected `threadId → prior label set` before acting.
2. Applies the operation (via existing `emailActions` / label ops).
3. Returns a `BulkResult { count, undo() }`; the UI shows an Undo toast.

`undo()` restores the snapshotted labels (re-add INBOX, restore removed tags).
Snapshots are in-memory (per session) — undo is a short-lived affordance, not
durable history. Default is **archive (remove INBOX), never permanent delete**.

Pure, unit-testable core: `snapshot(threads)` and `restore(snapshot)` logic.

## Feature A: Smart Cleanup

### Service — `services/cleanup/cleanupManager.ts`

- `getSenderClusters(accountId, { limit }) : SenderCluster[]`
  - New SQL aggregation over INBOX threads: `GROUP BY from_address`.
  - `SenderCluster { fromName, fromAddress, count, lastReceivedAt, unreadCount, hasUnsubscribe }`, sorted by `count DESC`.
- `getAgeSweepCount(accountId, olderThanDays, { readOnly }) : { count, threadIds }`
  - INBOX threads with `last_message_at < cutoff`; optional read-only.
- Executors (all via `bulkOps`):
  - `archiveSenders(accountId, fromAddresses[])`
  - `archiveOlderThan(accountId, olderThanDays, { readOnly })`
  - `unsubscribeAndArchive(accountId, fromAddress)` — reuses `unsubscribeManager.executeUnsubscribe` then archives the sender's threads.
  - `alwaysArchiveSender(accountId, fromAddress)` — writes a standing `filter_rules` row (`criteria.from = address`, `actions.archive = true`).

### DB — `services/db/cleanup.ts` (queries only)

- `selectSenderClusters(...)`, `selectAgeSweep(...)`, `selectSenderThreadIds(...)`.
  (Kept separate from `threads.ts` to avoid bloating it.)

### UI — `components/cleanup/CleanupPage.tsx` (+ `/cleanup` route, sidebar item)

- Header: inbox summary ("N threads in inbox").
- **By sender** section: rows with avatar, name, count, "last received", an
  unsubscribe badge when `hasUnsubscribe`. Per-row: **Archive all**,
  **Unsubscribe + archive all** (when applicable), and an overflow **"Always
  archive from this sender"**. Multi-select senders → "Archive selected (N)".
- **Sweeps** section: "Archive read mail older than [30/90/180d]" with a live
  preview count and an Archive button.
- Every destructive action **confirms with the exact count**, then shows the
  Undo toast. Archive-not-delete.

Sub-components: `SenderClusterRow`, `AgeSweepControls`.

## Feature B: AI Auto-Tagging

### Profiling — `services/smartTags/inboxProfiler.ts`

- `gatherProfileSignals(accountId) : ProfileSignals` (no AI): top senders/domains
  with counts, category distribution, who the user emails (sent patterns),
  a bounded sample of subjects/snippets.
- `buildInboxProfile(accountId) : InboxProfile` — one AI call summarizing signals
  into `{ role, keyContacts[], orgs[], themes[], relationshipTypes[], generatedAt }`.
  Persisted in `settings` under `inbox_profile` (JSON; no migration).

### Taxonomy proposal — `services/smartTags/taxonomyService.ts`

- `proposeTags(accountId, profile, existingTags) : TagSuggestion[]`
  - `TagSuggestion { name, definition, rationale, type: "intent"|"relationship"|"project"|"topic", suggestedCriteria? }`
  - Always includes baseline **To respond** (AI, Primary-scoped) and **Awaiting
    reply** (pure rule via `followupManager`), plus AI-discovered contextual tags.
  - Deduped against `existingTags` and already-created smart tags.
- `createTagFromSuggestion(accountId, suggestion)` — creates a `labels` row
  (auto color) + a `smart_label_rules` row (`ai_description = definition`,
  `criteria_json` if `suggestedCriteria`), then triggers `backfillService`.

### Review UI — `components/smartTags/SmartTagSetup.tsx`

- Lists suggestions with name + rationale; each has **Approve / Edit / Reject**.
- Approve → create + backfill (with progress). **"Suggest more"** re-runs
  profiler + proposer, deduped. Entry point: a new **Settings → "Smart Tags"**
  tab (and a first-run nudge later).

### Application

- Reuses the existing `applySmartLabelsToMessages` sync hook (criteria fast-path
  → AI only for ambiguous). "Awaiting reply" handled by a dedicated rule pass
  (reusing follow-up logic); "To respond" scoped to Primary-category inbox to
  cap AI cost. All AI results `ai_cache`-backed and per-sender memoized.

### Tag cleanup/merge wizard — `components/labels/TagCleanupWizard.tsx`

- `services/smartTags/tagMergeService.ts`:
  - `proposeTagMerges(accountId, profile) : TagMergeProposal[]`
    - `{ existingLabelId, existingName, count, action: "merge"|"keep"|"delete", targetLabelId? }`
    - AI proposes, using the profile for context.
  - `applyTagMerges(accountId, proposals[])` — for `merge`: move `thread_labels`
    from source to target then delete source; for `delete`: remove label +
    its `thread_labels`. Snapshotted via `bulkOps` for Undo.
  - **Pure function** `computeMergeOperations(proposals)` → list of label ops
    (unit-tested).
- Wizard UI: table of existing tags with the proposed action, editable, Apply.

## Data model

- **No new tables.** `inbox_profile` lives in `settings`. Tags reuse `labels` +
  `smart_label_rules`. "Always archive" reuses `filter_rules`. Undo snapshots
  are in-memory.

## Routing / navigation

- `/cleanup` route + `ALL_NAV_ITEMS` "Cleanup" (broom icon) + `navigate.ts` +
  `useActiveLabel` cases (the latter two are the spots the Today tab missed).
- Smart Tags entry via a new Settings tab; merge wizard launchable from there
  and from the Labels settings.

## Testing

- `bulkOps`: snapshot → restore round-trips.
- `cleanupManager` / `db/cleanup`: sender-cluster aggregation, age-sweep counting
  (date boundary), sender thread-id selection.
- `inboxProfiler`: signal gathering (pure), profile JSON parsing.
- `taxonomyService`: suggestion parsing + dedupe against existing tags.
- `tagMergeService`: `computeMergeOperations` pure mapping → ops.
- Component smoke tests where the existing suite has precedent.

## Build phases (sequenced)

1. **Shared undo** — `bulkOps` + tests.
2. **Cleanup** — `db/cleanup`, `cleanupManager`, `CleanupPage` + route/nav.
3. **Profiler + taxonomy + setup UI** — profiling, proposal, review wizard,
   Settings tab, application wiring.
4. **Merge wizard** — propose/apply merges + wizard UI.

## Safety / pitfalls (from research)

- Archive-not-delete by default; preview exact counts; one batch Undo.
- Unsubscribe prefers RFC 8058 one-click POST (already in `unsubscribeManager`).
- Cap visible tags (~9) to avoid sprawl; always-review prevents over-tagging.
- AI cost gated: header/criteria fast-paths, Primary-only scope for "To
  respond", per-sender memo + `ai_cache`, newest-message-only context.
