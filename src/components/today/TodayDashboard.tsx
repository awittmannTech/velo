import { useEffect, useRef, useState } from "react";
import { Sun, RefreshCw, Star } from "lucide-react";
import type { TodayDigest, TaskSuggestion } from "@/services/today/digestManager";
import type { DbTask } from "@/services/db/tasks";
import { StatStrip, type StatKind } from "./StatStrip";
import { DayPanel } from "./DayPanel";
import { ThreadMiniList } from "./ThreadMiniList";
import { AgendaPanel } from "./AgendaPanel";
import { TodayTodosPanel } from "./TodayTodosPanel";
import { TodaySkeleton } from "./TodaySkeleton";
import { Toast, type ToastData } from "./Toast";

interface TodayDashboardProps {
  now: Date;
  /** Short name shown in the greeting (e.g. the email local part). */
  greetingName: string;
  digest: TodayDigest | null;
  suggestions: TaskSuggestion[];
  todos: DbTask[];
  loading: boolean;
  refreshing: boolean;
  busyThreadIds: Set<string>;
  completingIds: Set<string>;
  toast: ToastData | null;
  onToastClose: () => void;
  onRefresh: () => void;
  onOpenThread: (threadId: string) => void;
  onOpenInbox: () => void;
  onOpenSettings: () => void;
  onAcceptSuggestion: (s: TaskSuggestion) => void;
  onDismissSuggestion: (s: TaskSuggestion) => void;
  onCompleteTodo: (taskId: string) => void;
  onDraftReply: (threadId: string) => void;
  draftingThreadId: string | null;
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relativeTime(fromMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - fromMs) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

/**
 * Presentational Today dashboard — no data fetching or routing, so it can be
 * rendered in isolation (preview harness, tests). The container (TodayPage)
 * supplies data and callbacks.
 */
export function TodayDashboard({
  now,
  greetingName,
  digest,
  suggestions,
  todos,
  loading,
  refreshing,
  busyThreadIds,
  completingIds,
  toast,
  onToastClose,
  onRefresh,
  onOpenThread,
  onOpenInbox,
  onOpenSettings,
  onAcceptSuggestion,
  onDismissSuggestion,
  onCompleteTodo,
  onDraftReply,
  draftingThreadId,
}: TodayDashboardProps) {
  const aiAvailable = digest?.aiAvailable ?? true;
  const needsReplyRef = useRef<HTMLDivElement>(null);
  const vipRef = useRef<HTMLDivElement>(null);

  // Re-render every 60s so "Updated Xm ago" stays current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const handleStat = (kind: StatKind) => {
    if (kind === "received" || kind === "unread") onOpenInbox();
    else if (kind === "awaiting") needsReplyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (kind === "important") vipRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sun size={20} className="text-accent shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-text-primary leading-tight truncate">
              {greeting(now)}{greetingName ? `, ${greetingName}` : ""}
            </h1>
            <p className="text-xs text-text-tertiary truncate">
              {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {digest && !refreshing && (
            <span className="hidden sm:inline text-xs text-text-tertiary">
              Updated {relativeTime(digest.generatedAt, now.getTime())}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary border border-border-primary hover:border-accent disabled:opacity-60"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <div className="w-full space-y-5">
          {loading && !digest ? (
            <TodaySkeleton />
          ) : (
            <>
              <StatStrip
                stats={digest?.stats ?? { received: 0, unread: 0, awaitingReply: 0 }}
                vipCount={digest?.vip.length ?? 0}
                onStat={handleStat}
              />

              <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
                {/* Main column */}
                <div ref={needsReplyRef} className="min-w-0 space-y-5 scroll-mt-4">
                  <DayPanel
                    brief={digest?.brief ?? null}
                    briefError={digest?.briefError ?? null}
                    loading={loading || refreshing}
                    aiAvailable={aiAvailable}
                    hasThreads={(digest?.threads.length ?? 0) > 0}
                    onOpenSettings={onOpenSettings}
                    toRespond={digest?.needsReply ?? []}
                    fyi={digest?.fyi ?? []}
                    onOpenThread={onOpenThread}
                    onDraftReply={onDraftReply}
                    draftingThreadId={draftingThreadId}
                  />
                </div>

                {/* Side column */}
                <div className="min-w-0 space-y-5">
                  <TodayTodosPanel
                    aiAvailable={aiAvailable}
                    loading={loading || refreshing}
                    suggestions={suggestions}
                    todos={todos}
                    suggestionsError={digest?.suggestionsError ?? null}
                    busyThreadIds={busyThreadIds}
                    completingIds={completingIds}
                    onAccept={onAcceptSuggestion}
                    onDismiss={onDismissSuggestion}
                    onCompleteTodo={onCompleteTodo}
                    onOpenThread={onOpenThread}
                  />

                  <AgendaPanel items={digest?.agenda ?? []} onOpen={onOpenThread} />

                  <div ref={vipRef} className="scroll-mt-4">
                    <ThreadMiniList
                      title="VIP & important"
                      icon={Star}
                      threads={digest?.vip ?? []}
                      emptyText="Nothing flagged important today."
                      onOpen={onOpenThread}
                      max={6}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Toast toast={toast} onClose={onToastClose} />
    </div>
  );
}
