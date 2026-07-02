import { parseSearchQuery } from "@/services/search/searchParser";

/**
 * Pure query construction for the backup feature. Translates a user-facing
 * {@link BackupScope} into a normalized {@link BackupQuerySpec}, then into
 * parameterized SQL that selects full message rows (or a count) from the local
 * `messages` table.
 *
 * NOTE: `messages.date` is stored in Unix **milliseconds**. The search parser
 * emits `before`/`after` in **seconds**, so `scopeToQuerySpec` converts them.
 */

/** A user-chosen backup target. */
export type BackupScope =
  | { kind: "everything" }
  | { kind: "label"; label: string }
  | { kind: "sender"; sender: string }
  | { kind: "dateRange"; afterMs?: number; beforeMs?: number }
  | { kind: "search"; query: string };

/** Normalized, millisecond-based criteria consumed by the SQL builders. */
export interface BackupQuerySpec {
  freeText?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isRead?: boolean;
  isStarred?: boolean;
  afterMs?: number;
  beforeMs?: number;
  label?: string;
}

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

/** Convert a scope into normalized millisecond-based criteria. */
export function scopeToQuerySpec(scope: BackupScope): BackupQuerySpec {
  switch (scope.kind) {
    case "everything":
      return {};
    case "label":
      return { label: scope.label };
    case "sender":
      return { from: scope.sender };
    case "dateRange": {
      const spec: BackupQuerySpec = {};
      if (scope.afterMs !== undefined) spec.afterMs = scope.afterMs;
      if (scope.beforeMs !== undefined) spec.beforeMs = scope.beforeMs;
      return spec;
    }
    case "search": {
      const parsed = parseSearchQuery(scope.query);
      const spec: BackupQuerySpec = {};
      if (parsed.freeText) spec.freeText = parsed.freeText;
      if (parsed.from) spec.from = parsed.from;
      if (parsed.to) spec.to = parsed.to;
      if (parsed.subject) spec.subject = parsed.subject;
      if (parsed.hasAttachment) spec.hasAttachment = true;
      if (parsed.isUnread) spec.isUnread = true;
      if (parsed.isRead) spec.isRead = true;
      if (parsed.isStarred) spec.isStarred = true;
      if (parsed.label) spec.label = parsed.label;
      // searchParser emits seconds; messages.date is milliseconds.
      if (parsed.after !== undefined) spec.afterMs = parsed.after * 1000;
      if (parsed.before !== undefined) spec.beforeMs = parsed.before * 1000;
      return spec;
    }
  }
}

interface WhereParts {
  fromClause: string;
  whereStr: string;
  params: unknown[];
  needsFts: boolean;
  nextIdx: number;
}

/** Shared WHERE/FROM construction for both the row and count queries. */
function buildWhere(spec: BackupQuerySpec, accountId: string): WhereParts {
  const params: unknown[] = [];
  let idx = 1;
  const where: string[] = [];
  let fromClause = "FROM messages m";
  let needsFts = false;

  if (spec.freeText) {
    needsFts = true;
    fromClause = "FROM messages_fts JOIN messages m ON m.rowid = messages_fts.rowid";
    where.push(`messages_fts MATCH $${idx}`);
    params.push(spec.freeText);
    idx++;
  }

  where.push(`m.account_id = $${idx}`);
  params.push(accountId);
  idx++;

  if (spec.from) {
    where.push(`(m.from_address LIKE '%' || $${idx} || '%' OR m.from_name LIKE '%' || $${idx} || '%')`);
    params.push(spec.from);
    idx++;
  }
  if (spec.to) {
    where.push(`m.to_addresses LIKE '%' || $${idx} || '%'`);
    params.push(spec.to);
    idx++;
  }
  if (spec.subject) {
    where.push(`m.subject LIKE '%' || $${idx} || '%'`);
    params.push(spec.subject);
    idx++;
  }
  if (spec.hasAttachment) {
    where.push(
      "EXISTS (SELECT 1 FROM attachments a WHERE a.account_id = m.account_id AND a.message_id = m.id)",
    );
  }
  if (spec.isUnread) where.push("m.is_read = 0");
  if (spec.isRead) where.push("m.is_read = 1");
  if (spec.isStarred) where.push("m.is_starred = 1");
  if (spec.afterMs !== undefined) {
    where.push(`m.date >= $${idx}`);
    params.push(spec.afterMs);
    idx++;
  }
  if (spec.beforeMs !== undefined) {
    where.push(`m.date <= $${idx}`);
    params.push(spec.beforeMs);
    idx++;
  }
  if (spec.label) {
    where.push(
      `EXISTS (SELECT 1 FROM thread_labels tl JOIN labels l ON l.account_id = tl.account_id AND l.id = tl.label_id WHERE tl.account_id = m.account_id AND tl.thread_id = m.thread_id AND (LOWER(l.name) = LOWER($${idx}) OR l.id = $${idx}))`,
    );
    params.push(spec.label);
    idx++;
  }

  return { fromClause, whereStr: `WHERE ${where.join(" AND ")}`, params, needsFts, nextIdx: idx };
}

/**
 * Build a paginated SELECT of full message rows matching the spec, ordered
 * oldest-first for stable, resumable export ordering.
 */
export function buildBackupQuery(
  spec: BackupQuerySpec,
  accountId: string,
  opts: { limit: number; offset: number },
): BuiltQuery {
  const { fromClause, whereStr, params, nextIdx } = buildWhere(spec, accountId);
  const limitParam = nextIdx;
  const offsetParam = nextIdx + 1;
  const sql = `SELECT m.* ${fromClause} ${whereStr} ORDER BY m.date ASC, m.id ASC LIMIT $${limitParam} OFFSET $${offsetParam}`;
  return { sql, params: [...params, opts.limit, opts.offset] };
}

/** Build a COUNT query for the live preview. */
export function buildBackupCountQuery(spec: BackupQuerySpec, accountId: string): BuiltQuery {
  const { fromClause, whereStr, params } = buildWhere(spec, accountId);
  const sql = `SELECT COUNT(*) as count ${fromClause} ${whereStr}`;
  return { sql, params };
}
