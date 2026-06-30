import {
  getInboxThreadCount,
  getSenderClusters,
  getAgeSweepCount,
  getSenderThreads,
  getAgeSweepThreads,
  type SenderCluster,
} from "@/services/db/cleanup";
import { bulkArchive, type BulkResult } from "./bulkOps";
import { executeUnsubscribe, getSubscriptions } from "@/services/unsubscribe/unsubscribeManager";
import { insertFilter } from "@/services/db/filters";

export interface CleanupData {
  inboxCount: number;
  senders: SenderCluster[];
}

/** Pure: the cutoff timestamp (ms) for an "older than N days" sweep. */
export function ageCutoffMs(days: number, now = Date.now()): number {
  return now - days * 86_400_000;
}

export async function loadCleanup(accountId: string): Promise<CleanupData> {
  const [inboxCount, senders] = await Promise.all([
    getInboxThreadCount(accountId),
    getSenderClusters(accountId),
  ]);
  return { inboxCount, senders };
}

export async function previewAgeSweep(
  accountId: string,
  days: number,
  readOnly: boolean,
): Promise<number> {
  return getAgeSweepCount(accountId, ageCutoffMs(days), readOnly);
}

export async function archiveSenders(accountId: string, addresses: string[]): Promise<BulkResult> {
  const threads = await getSenderThreads(accountId, addresses);
  return bulkArchive(accountId, threads);
}

export async function archiveOlderThan(
  accountId: string,
  days: number,
  readOnly: boolean,
): Promise<BulkResult> {
  const threads = await getAgeSweepThreads(accountId, ageCutoffMs(days), readOnly);
  return bulkArchive(accountId, threads);
}

/**
 * Unsubscribe from a sender (RFC 8058 one-click → mailto → browser, via the
 * existing manager) and archive all their inbox threads.
 */
export async function unsubscribeAndArchive(
  accountId: string,
  address: string,
): Promise<{ unsubscribed: boolean; result: BulkResult }> {
  const threads = await getSenderThreads(accountId, [address]);
  let unsubscribed = false;
  try {
    const subs = await getSubscriptions(accountId);
    const entry = subs.find((s) => s.from_address.toLowerCase() === address.toLowerCase());
    const repThreadId = threads[0]?.threadId;
    if (entry?.latest_unsubscribe_header && repThreadId) {
      const r = await executeUnsubscribe(
        accountId,
        repThreadId,
        address,
        entry.from_name,
        entry.latest_unsubscribe_header,
        entry.latest_unsubscribe_post,
      );
      unsubscribed = r.success;
    }
  } catch {
    // Unsubscribe is best-effort; still archive.
  }
  const result = await bulkArchive(accountId, threads);
  return { unsubscribed, result };
}

/** Create a standing filter that auto-archives future mail from this sender. */
export async function alwaysArchiveSender(
  accountId: string,
  address: string,
  name: string | null,
): Promise<void> {
  await insertFilter({
    accountId,
    name: `Archive from ${name?.trim() || address}`,
    criteria: { from: address },
    actions: { archive: true },
  });
}
