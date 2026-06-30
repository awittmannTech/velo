import { getDb } from "./connection";
import type { BulkThread } from "@/services/cleanup/bulkOps";

/**
 * Read queries backing the Smart Cleanup page: cluster inbox clutter by sender,
 * count age sweeps, and resolve thread + message ids for bulk archiving.
 * (`last_message_at` / `messages.date` are Unix milliseconds.)
 */

export interface SenderCluster {
  address: string;
  name: string | null;
  count: number;
  lastReceived: number;
  unreadCount: number;
  hasUnsubscribe: boolean;
}

// Latest-message join shared by the queries: picks the newest message per thread.
const LATEST_MSG_JOIN = `
  LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
    AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)`;

const INBOX_JOIN = `
  INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id AND tl.label_id = 'INBOX'`;

export async function getInboxThreadCount(accountId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM threads t ${INBOX_JOIN}
     WHERE t.account_id = $1 AND t.is_muted = 0`,
    [accountId],
  );
  return rows[0]?.count ?? 0;
}

export async function getSenderClusters(
  accountId: string,
  minCount = 2,
  limit = 60,
): Promise<SenderCluster[]> {
  const db = await getDb();
  const rows = await db.select<
    { address: string; name: string | null; count: number; last_received: number; unread_count: number; has_unsubscribe: number }[]
  >(
    `SELECT m.from_address AS address,
            MAX(m.from_name) AS name,
            COUNT(*) AS count,
            MAX(t.last_message_at) AS last_received,
            SUM(CASE WHEN t.is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
            MAX(CASE WHEN m.list_unsubscribe IS NOT NULL THEN 1 ELSE 0 END) AS has_unsubscribe
     FROM threads t ${INBOX_JOIN} ${LATEST_MSG_JOIN}
     WHERE t.account_id = $1 AND t.is_muted = 0 AND m.from_address IS NOT NULL
     GROUP BY m.from_address
     HAVING count >= $2
     ORDER BY count DESC
     LIMIT $3`,
    [accountId, minCount, limit],
  );
  return rows.map((r) => ({
    address: r.address,
    name: r.name,
    count: r.count,
    lastReceived: r.last_received,
    unreadCount: r.unread_count,
    hasUnsubscribe: r.has_unsubscribe === 1,
  }));
}

export async function getAgeSweepCount(
  accountId: string,
  cutoffMs: number,
  readOnly: boolean,
): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM threads t ${INBOX_JOIN}
     WHERE t.account_id = $1 AND t.is_muted = 0 AND t.last_message_at < $2
       ${readOnly ? "AND t.is_read = 1" : ""}`,
    [accountId, cutoffMs],
  );
  return rows[0]?.count ?? 0;
}

function groupIntoBulkThreads(rows: { thread_id: string; message_id: string }[]): BulkThread[] {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.thread_id) ?? [];
    arr.push(r.message_id);
    map.set(r.thread_id, arr);
  }
  return [...map.entries()].map(([threadId, messageIds]) => ({ threadId, messageIds }));
}

/** Inbox threads whose latest sender is one of `addresses`, with all their message ids. */
export async function getSenderThreads(
  accountId: string,
  addresses: string[],
): Promise<BulkThread[]> {
  if (addresses.length === 0) return [];
  const db = await getDb();
  const placeholders = addresses.map((_, i) => `$${i + 2}`).join(", ");
  const rows = await db.select<{ thread_id: string; message_id: string }[]>(
    `SELECT t.id AS thread_id, mm.id AS message_id
     FROM threads t ${INBOX_JOIN} ${LATEST_MSG_JOIN}
     INNER JOIN messages mm ON mm.account_id = t.account_id AND mm.thread_id = t.id
     WHERE t.account_id = $1 AND t.is_muted = 0 AND m.from_address IN (${placeholders})`,
    [accountId, ...addresses],
  );
  return groupIntoBulkThreads(rows);
}

/** Inbox threads older than `cutoffMs`, with all their message ids. */
export async function getAgeSweepThreads(
  accountId: string,
  cutoffMs: number,
  readOnly: boolean,
): Promise<BulkThread[]> {
  const db = await getDb();
  const rows = await db.select<{ thread_id: string; message_id: string }[]>(
    `SELECT t.id AS thread_id, mm.id AS message_id
     FROM threads t ${INBOX_JOIN}
     INNER JOIN messages mm ON mm.account_id = t.account_id AND mm.thread_id = t.id
     WHERE t.account_id = $1 AND t.is_muted = 0 AND t.last_message_at < $2
       ${readOnly ? "AND t.is_read = 1" : ""}`,
    [accountId, cutoffMs],
  );
  return groupIntoBulkThreads(rows);
}
