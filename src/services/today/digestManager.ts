import type { DbThread } from "@/services/db/threads";
import { getInboxThreadsSince } from "@/services/db/threads";
import { getMessagesForThread } from "@/services/db/messages";
import { getThreadIdsWithTasks, getTodayTasks, type TaskPriority, type DbTask } from "@/services/db/tasks";
import { getDismissedSuggestionThreadIds } from "@/services/db/dismissedSuggestions";
import { getVipSenders } from "@/services/db/notificationVips";
import { getCalendarEventsInRange } from "@/services/db/calendarEvents";
import { getPendingFollowUpReminders } from "@/services/db/followUpReminders";
import { getThreadById } from "@/services/db/threads";
import { getAiCache, setAiCache } from "@/services/db/aiCache";
import { isAiAvailable } from "@/services/ai/providerManager";
import { generateDailyDigest, classifyNeedsReply } from "@/services/ai/aiService";
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
  /** Sender of the source thread, for "{person} needs you to…" attribution. */
  fromName: string | null;
  fromAddress: string | null;
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
  /** Action items: threads a human expects you to reply to. */
  needsReply: TodayThread[];
  /** Side info: today's mail that doesn't need a reply (alerts, receipts, automated). */
  fyi: TodayThread[];
  vip: TodayThread[];
  agenda: AgendaItem[];
  brief: string | null;
  briefError: string | null;
  suggestions: TaskSuggestion[];
  suggestionsError: string | null;
  /** Today's real (accepted/created/due) to-dos. */
  todayTasks: DbTask[];
}

// ---------- Pure helpers (unit-tested) ----------

/** Local midnight (start of today) as Unix milliseconds — matches thread/message dates. */
export function getTodayStartMs(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function normalizeEmail(addr: string | null | undefined): string {
  return (addr ?? "").trim().toLowerCase();
}

// Local parts that signal an unattended/automated mailbox no human reads.
const AUTOMATED_RE = /(^|[._+-])(no[._-]?reply|do[._-]?not[._-]?reply|notifications?|notify|alerts?|mailer[._-]?daemon|postmaster|bounce|automated|auto[._-]?confirm|donotreply|support[._-]?noreply)([._+-]|@|$)/i;

/** Pure: is this address an unattended/automated sender that won't read a reply? */
export function isAutomatedSender(address: string | null | undefined): boolean {
  const addr = normalizeEmail(address);
  if (!addr) return false;
  const local = addr.split("@")[0] ?? "";
  return AUTOMATED_RE.test(local) || AUTOMATED_RE.test(addr);
}

/**
 * Rule fast-path for "needs reply": the latest message is from someone other
 * than the user, and not an automated/no-reply sender. AI further refines which
 * of these actually expect a human response (see refineNeedsReply).
 */
export function isNeedsReply(thread: TodayThread, accountEmail: string): boolean {
  const from = normalizeEmail(thread.fromAddress);
  if (!from) return false;
  if (from === normalizeEmail(accountEmail)) return false;
  if (isAutomatedSender(from)) return false;
  return true;
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
        fromName: thread.fromName,
        fromAddress: thread.fromAddress,
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

const NEEDS_REPLY_CACHE_TYPE = "needs_reply";

/**
 * Refine the rule-based needs-reply candidates with AI: keep only threads a
 * human actually expects a reply to. Cached per-thread (keyed by lastMessageAt)
 * so the auto-refresh is cheap; on AI failure, keeps all candidates.
 */
async function refineNeedsReply(
  accountId: string,
  candidates: TodayThread[],
  forceAi: boolean,
): Promise<TodayThread[]> {
  const verdicts = new Map<string, boolean>();
  const toClassify: TodayThread[] = [];

  for (const t of candidates) {
    if (!forceAi) {
      const cached = await getAiCache(accountId, t.id, NEEDS_REPLY_CACHE_TYPE);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { h: number; v: boolean };
          if (parsed.h === (t.lastMessageAt ?? 0)) {
            verdicts.set(t.id, parsed.v);
            continue;
          }
        } catch {
          // stale/corrupt → reclassify
        }
      }
    }
    toClassify.push(t);
  }

  if (toClassify.length > 0) {
    try {
      const yes = await classifyNeedsReply(
        toClassify.map((t) => ({
          id: t.id,
          fromName: t.fromName,
          fromAddress: t.fromAddress,
          subject: t.subject,
          snippet: t.snippet,
        })),
      );
      for (const t of toClassify) {
        const v = yes.has(t.id);
        verdicts.set(t.id, v);
        await setAiCache(accountId, t.id, NEEDS_REPLY_CACHE_TYPE, JSON.stringify({ h: t.lastMessageAt ?? 0, v }));
      }
    } catch {
      // AI unavailable/failed — don't drop anything.
      for (const t of toClassify) verdicts.set(t.id, true);
    }
  }

  return candidates.filter((t) => verdicts.get(t.id) !== false);
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

  const aiAvailable = await isAiAvailable();

  // Needs reply: rule fast-path (excludes you + automated senders), then AI
  // keeps only threads a human actually expects a reply to.
  const ruleNeedsReply = threads.filter((t) => isNeedsReply(t, accountEmail));
  const needsReply =
    aiAvailable && ruleNeedsReply.length > 0
      ? await refineNeedsReply(accountId, ruleNeedsReply, forceAi)
      : ruleNeedsReply;

  // "Awaiting you" stat reflects the refined needs-reply list.
  const stats = { ...computeStats(threads, accountEmail), awaitingReply: needsReply.length };

  // FYI: today's mail that isn't an action item and isn't your own sent message.
  const needsReplyIds = new Set(needsReply.map((t) => t.id));
  const fyi = threads.filter(
    (t) => !needsReplyIds.has(t.id) && normalizeEmail(t.fromAddress) !== normalizeEmail(accountEmail),
  );

  // VIP highlights: VIP senders, falling back to Gmail "important".
  const vipSenders = await getVipSenders(accountId).catch(() => new Set<string>());
  const vip = threads.filter((t) => {
    const from = normalizeEmail(t.fromAddress);
    return (from && vipSenders.has(from)) || t.isImportant;
  });

  const agenda = await buildAgenda(accountId, todayStartMs);

  const dayStartSec = Math.floor(todayStartMs / 1000);
  const todayTasks = await getTodayTasks(accountId, dayStartSec, dayStartSec + 86400).catch(() => []);

  let brief: string | null = null;
  let briefError: string | null = null;
  let suggestions: TaskSuggestion[] = [];
  let suggestionsError: string | null = null;

  if (aiAvailable) {
    // The brief summarizes the action items only (who needs you), so it never
    // just re-narrates the FYI list.
    const briefHash = digestContentHash(needsReply);
    const [threadIdsWithTasks, dismissed] = await Promise.all([
      getThreadIdsWithTasks(accountId),
      getDismissedSuggestionThreadIds(accountId),
    ]);
    const candidates = selectSuggestionCandidates(threads, accountEmail, threadIdsWithTasks, dismissed);

    const briefResult = await buildBrief(accountId, needsReply, briefHash, forceAi);
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
    fyi,
    vip,
    agenda,
    brief,
    briefError,
    suggestions,
    suggestionsError,
    todayTasks,
  };
}
