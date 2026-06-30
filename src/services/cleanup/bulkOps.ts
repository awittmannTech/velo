import { getThreadLabelIds } from "@/services/db/threads";
import { archiveThread, addThreadLabel } from "@/services/emailActions";

/**
 * Shared batch-operation helper for bulk cleanup/tagging actions. Snapshots the
 * affected threads' labels before acting so the UI can offer a single Undo, and
 * defaults to archive (remove INBOX) rather than permanent delete.
 *
 * Snapshots are in-memory for the session — Undo is a short-lived affordance,
 * not durable history.
 */

export interface BulkThread {
  threadId: string;
  messageIds: string[];
}

export interface LabelSnapshot {
  threadId: string;
  labelIds: string[];
}

export interface BulkResult {
  count: number;
  undo: () => Promise<void>;
}

/**
 * Pure: given a thread's snapshotted labels and its current labels, return the
 * labels that need re-adding to restore the snapshot.
 */
export function labelsToRestore(snapshotLabelIds: string[], currentLabelIds: string[]): string[] {
  const current = new Set(currentLabelIds);
  return snapshotLabelIds.filter((id) => !current.has(id));
}

export async function snapshotLabels(accountId: string, threadIds: string[]): Promise<LabelSnapshot[]> {
  const snaps: LabelSnapshot[] = [];
  for (const threadId of threadIds) {
    snaps.push({ threadId, labelIds: await getThreadLabelIds(accountId, threadId) });
  }
  return snaps;
}

export async function restoreLabels(accountId: string, snapshot: LabelSnapshot[]): Promise<void> {
  for (const snap of snapshot) {
    const current = await getThreadLabelIds(accountId, snap.threadId);
    for (const labelId of labelsToRestore(snap.labelIds, current)) {
      await addThreadLabel(accountId, snap.threadId, labelId);
    }
  }
}

/**
 * Archive a batch of threads (remove INBOX) with a single Undo that restores
 * their prior labels.
 */
export async function bulkArchive(accountId: string, items: BulkThread[]): Promise<BulkResult> {
  const snapshot = await snapshotLabels(accountId, items.map((i) => i.threadId));
  for (const item of items) {
    await archiveThread(accountId, item.threadId, item.messageIds);
  }
  return {
    count: items.length,
    undo: () => restoreLabels(accountId, snapshot),
  };
}
