import { getDb } from "./connection";

/**
 * Persistence for task suggestions the user has dismissed on the Today
 * dashboard, so the same thread isn't suggested again.
 */

export async function dismissTaskSuggestion(
  accountId: string,
  threadId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO dismissed_task_suggestions (account_id, thread_id)
     VALUES ($1, $2)
     ON CONFLICT(account_id, thread_id) DO UPDATE SET dismissed_at = unixepoch()`,
    [accountId, threadId],
  );
}

export async function undismissTaskSuggestion(
  accountId: string,
  threadId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM dismissed_task_suggestions WHERE account_id = $1 AND thread_id = $2",
    [accountId, threadId],
  );
}

export async function getDismissedSuggestionThreadIds(
  accountId: string,
): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select<{ thread_id: string }[]>(
    "SELECT thread_id FROM dismissed_task_suggestions WHERE account_id = $1",
    [accountId],
  );
  return new Set(rows.map((r) => r.thread_id));
}
