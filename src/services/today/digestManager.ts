import type { DbThread } from "@/services/db/threads";
import { getInboxThreadsSince } from "@/services/db/threads";
import { getMessagesForThread } from "@/services/db/messages";
import { getThreadIdsWithTasks, type TaskPriority } from "@/services/db/tasks";
import { getDismissedSuggestionThreadIds } from "@/services/db/dismissedSuggestions";
import { getVipSenders } from "@/services/db/notificationVips";
import { getCalendarEventsInRange } from "@/services/db/calendarEvents";
import { getPendingFollowUpReminders } from "@/services/db/followUpReminders";
import { getThreadById } from "@/services/db/threads";
import { getAiCache, setAiCache } from "@/services/db/aiCache";
import { isAiAvailable } from "@/services/ai/providerManager";
import { generateDailyDigest } from "@/services/ai/aiService";
import { extractTask } from "@/services/ai/taskExtraction";

// ---------- Types ----------

export interface TodayStats {
  received: number;
  unread: number;
  awaitingReply: number;
}

export interface TodayThread {
  id: string;
  subject: string;
  snippet: string;
  fromName: string | null;
  fromAddress: string | null;
  lastMessageAt: number | null;
  isUnread: boolean;
  isImportant: boolean;
}

export interface TaskSuggestion {
  threadId: string;
  accountId: string;
  subject: string;
  title: string;
  description: string | null;
  dueDate: number | null;
  priority: TaskPriority;
}

export interface AgendaItem {
  kind: "event" | "followup";
  title: string;
  /** Unix seconds (calendar start_time / follow-up remind_at), or null for all-day. */
  time: number | null;
  threadId?: string;
}

export interface TodayDigest {
  generatedAt: number;
  aiAvailable: boolean;
  stats: TodayStats;
  threads: TodayThread[];
  needsReply: TodayThread[];
  vip: TodayThread[];
  agenda: AgendaItem[];
  brief: string | null;
  briefError: string | null;
  suggestions: TaskSuggestion[];
  suggestionsError: string | null;
}

// ---------- Pure helpers (unit-tested) ----------

/** Local midnight (start of today) as Unix milliseconds — matches thread/message dates. */
export function getTodayStartMs(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function normalizeEmail(addr: string | null | undefined): string {
  return (addr ?? "").trim().toLowerCase();
}

/** A thread needs a reply if its latest message is from someone other than the user. */
export function isNeedsReply(thread: TodayThread, accountEmail: string): boolean {
  const from = normalizeEmail(thread.fromAddress);
  if (!from) return false;
  return from !== normalizeEmail(accountEmail);
}

export function computeStats(threads: TodayThread[], accountEmail: string): TodayStats {
  let unread = 0;
  let awaitingReply = 0;
  for (const t of threads) {
    if (t.isUnread) unread++;
    if (isNeedsReply(t, accountEmail)) awaitingReply++;
  }
  return { received: threads.length, unread, awaitingReply };
}

/**
 * Threads worth suggesting a task for: actionable (needs reply), not already
 * turned into a task, and not previously dismissed — capped to bound AI work.
 */
export function selectSuggestionCandidates(
  threads: TodayThread[],
  accountEmail: string,
  threadIdsWithTasks: Set<string>,
  dismissedThreadIds: Set<string>,
  cap = 8,
): TodayThread[] {
  return threads
    .filter((t) => isNeedsReply(t, accountEmail))
    .filter((t) => !threadIdsWithTasks.has(t.id))
    .filter((t) => !dismissedThreadIds.has(t.id))
    .slice(0, cap);
}

/** Stable fingerprint of today's thread set, used to decide if the AI brief is stale. */
export function digestContentHash(threads: TodayThread[]): string {
  const basis = threads
    .map((t) => `${t.id}:${t.lastMessageAt ?? 0}:${t.isUnread ? 1 : 0}`)
    .sort()
    .join("|");
  let hash = 5381;
  for (let i = 0; i < basis.length; i++) {
    hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
  }
  return `${threads.length}-${hash}`;
}

// ---------- Mapping ----------

function toTodayThread(t: DbThread): TodayThread {
  return {
    id: t.id,
    subject: t.subject?.trim() || "(no subject)",
    snippet: t.snippet?.trim() || "",
    fromName: t.from_name,
    fromAddress: t.from_address,
    lastMessageAt: t.last_message_at,
    isUnread: t.is_read === 0,
    isImportant: t.is_important === 1,
  };
}

// ---------- Orchestrator ----------

const DIGEST_CACHE_THREAD_ID = "__today_digest__";
const DIGEST_CACHE_TYPE = "daily_digest";
const SUGGESTION_CACHE_TYPE = "task_suggestion";

async function buildBrief(
  accountId: string,
  threads: TodayThread[],
  hash: string,
  forceAi: boolean,
): Promise<{ brief: string | null; error: string | null }> {
  if (threads.length === 0) {
    return { brief: null, error: null };
  }
  if (!forceAi) {
    const cached = await getAiCache(accountId, DIGEST_CACHE_THREAD_ID, DIGEST_CACHE_TYPE);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { hash: string; brief: string };
        if (parsed.hash === hash && parsed.brief) return { brief: parsed.brief, error: null };
      } catch {
        // fall through and regenerate
      }
    }
  }
  try {
    const brief = await generateDailyDigest(
      threads.slice(0, 40).map((t) => ({
        fromName: t.fromName,
        fromAddress: t.fromAddress,
        subject: t.subject,
        snippet: t.snippet,
      })),
    );
    await setAiCache(accountId, DIGEST_CACHE_THREAD_ID, DIGEST_CACHE_TYPE, JSON.stringify({ hash, brief }));
    return { brief, error: null };
  } catch (err) {
    return { brief: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function buildSuggestions(
  accountId: string,
  candidates: TodayThread[],
  forceAi: boolean,
): Promise<{ suggestions: TaskSuggestion[]; error: string | null }> {
  const suggestions: TaskSuggestion[] = [];
  let error: string | null = null;
  for (const thread of candidates) {
    try {
      let extracted: { title: string; description: string | null; dueDate: number | null; priority: TaskPriority } | null = null;
      if (!forceAi) {
        const cached = await getAiCache(accountId, thread.id, SUGGESTION_CACHE_TYPE);
        if (cached) {
          try { extracted = JSON.parse(cached); } catch { /* regenerate */ }
        }
      }
      if (!extracted) {
        const messages = await getMessagesForThread(accountId, thread.id);
        if (messages.length === 0) continue;
        const result = await extractTask(thread.id, accountId, messages);
        extracted = result;
        await setAiCache(accountId, thread.id, SUGGESTION_CACHE_TYPE, JSON.stringify(result));
      }
      suggestions.push({
        threadId: thread.id,
        accountId,
        subject: thread.subject,
        title: extracted.title,
        description: extracted.description,
        dueDate: extracted.dueDate,
        priority: extracted.priority,
      });
    } catch (err) {
      // Record the first error but keep going for other threads.
      if (!error) error = err instanceof Error ? err.message : String(err);
    }
  }
  return { suggestions, error };
}

async function buildAgenda(accountId: string, todayStartMs: number): Promise<AgendaItem[]> {
  const items: AgendaItem[] = [];

  // Today's calendar events (calendar_events stores seconds).
  try {
    const startSec = Math.floor(todayStartMs / 1000);
    const endSec = startSec + 86400;
    const events = await getCalendarEventsInRange(accountId, startSec, endSec);
    for (const e of events) {
      if (e.status === "cancelled") continue;
      items.push({
        kind: "event",
        title: e.summary?.trim() || "(busy)",
        time: e.is_all_day ? null : e.start_time,
      });
    }
  } catch {
    // Calendar not connected / not synced — skip silently.
  }

  // Follow-up reminders that have come due.
  try {
    const reminders = (await getPendingFollowUpReminders()).filter((r) => r.account_id === accountId);
    for (const r of reminders) {
      const thread = await getThreadById(accountId, r.thread_id);
      items.push({
        kind: "followup",
        title: thread?.subject?.trim() || "Follow up",
        time: r.remind_at,
        threadId: r.thread_id,
      });
    }
  } catch {
    // ignore
  }

  return items.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

/**
 * Build the full Today digest for an account. `forceAi` bypasses AI caches
 * (used by the manual Refresh button).
 */
export async function buildTodayDigest(
  accountId: string,
  accountEmail: string,
  opts: { forceAi?: boolean; now?: Date } = {},
): Promise<TodayDigest> {
  const now = opts.now ?? new Date();
  const forceAi = opts.forceAi ?? false;
  const todayStartMs = getTodayStartMs(now);

  const dbThreads = await getInboxThreadsSince(accountId, todayStartMs);
  const threads = dbThreads.map(toTodayThread);

  const stats = computeStats(threads, accountEmail);
  const needsReply = threads.filter((t) => isNeedsReply(t, accountEmail));

  // VIP highlights: VIP senders, falling back to Gmail "important".
  const vipSenders = await getVipSenders(accountId).catch(() => new Set<string>());
  const vip = threads.filter((t) => {
    const from = normalizeEmail(t.fromAddress);
    return (from && vipSenders.has(from)) || t.isImportant;
  });

  const agenda = await buildAgenda(accountId, todayStartMs);

  const aiAvailable = await isAiAvailable();

  let brief: string | null = null;
  let briefError: string | null = null;
  let suggestions: TaskSuggestion[] = [];
  let suggestionsError: string | null = null;

  if (aiAvailable) {
    const hash = digestContentHash(threads);
    const [threadIdsWithTasks, dismissed] = await Promise.all([
      getThreadIdsWithTasks(accountId),
      getDismissedSuggestionThreadIds(accountId),
    ]);
    const candidates = selectSuggestionCandidates(threads, accountEmail, threadIdsWithTasks, dismissed);

    const briefResult = await buildBrief(accountId, threads, hash, forceAi);
    brief = briefResult.brief;
    briefError = briefResult.error;

    const suggestionResult = await buildSuggestions(accountId, candidates, forceAi);
    suggestions = suggestionResult.suggestions;
    suggestionsError = suggestionResult.error;
  }

  return {
    generatedAt: now.getTime(),
    aiAvailable,
    stats,
    threads,
    needsReply,
    vip,
    agenda,
    brief,
    briefError,
    suggestions,
    suggestionsError,
  };
}
