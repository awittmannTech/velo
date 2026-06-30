import { Sun, RefreshCw, CornerUpLeft, Star } from "lucide-react";
import type { TodayDigest, TaskSuggestion } from "@/services/today/digestManager";
import { StatStrip } from "./StatStrip";
import { DigestBrief } from "./DigestBrief";
import { ThreadMiniList } from "./ThreadMiniList";
import { AgendaPanel } from "./AgendaPanel";
import { TaskSuggestionsPanel } from "./TaskSuggestionsPanel";

interface TodayDashboardProps {
  now: Date;
  /** Short name shown in the greeting (e.g. the email local part). */
  greetingName: string;
  digest: TodayDigest | null;
  suggestions: TaskSuggestion[];
  loading: boolean;
  refreshing: boolean;
  busyThreadIds: Set<string>;
  onRefresh: () => void;
  onOpenThread: (threadId: string) => void;
  onOpenSettings: () => void;
  onAcceptSuggestion: (s: TaskSuggestion) => void;
  onDismissSuggestion: (s: TaskSuggestion) => void;
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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
  loading,
  refreshing,
  busyThreadIds,
  onRefresh,
  onOpenThread,
  onOpenSettings,
  onAcceptSuggestion,
  onDismissSuggestion,
}: TodayDashboardProps) {
  const aiAvailable = digest?.aiAvailable ?? true;

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
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary border border-border-primary hover:border-accent disabled:opacity-60 shrink-0"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          <StatStrip
            stats={digest?.stats ?? { received: 0, unread: 0, awaitingReply: 0 }}
            vipCount={digest?.vip.length ?? 0}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
            {/* Main column */}
            <div className="min-w-0 space-y-5">
              <DigestBrief
                brief={digest?.brief ?? null}
                error={digest?.briefError ?? null}
                loading={loading || refreshing}
                aiAvailable={aiAvailable}
                hasThreads={(digest?.threads.length ?? 0) > 0}
                onOpenSettings={onOpenSettings}
              />

              <TaskSuggestionsPanel
                suggestions={suggestions}
                loading={loading || refreshing}
                aiAvailable={aiAvailable}
                error={digest?.suggestionsError ?? null}
                busyThreadIds={busyThreadIds}
                onAccept={onAcceptSuggestion}
                onDismiss={onDismissSuggestion}
                onOpen={onOpenThread}
              />

              <ThreadMiniList
                title="Needs reply"
                icon={CornerUpLeft}
                threads={digest?.needsReply ?? []}
                emptyText="No threads waiting on you today."
                onOpen={onOpenThread}
              />
            </div>

            {/* Side column */}
            <div className="min-w-0 space-y-5">
              <AgendaPanel items={digest?.agenda ?? []} onOpen={onOpenThread} />
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
      </div>
    </div>
  );
}
