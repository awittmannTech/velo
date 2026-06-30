import { useState, useEffect, useCallback, useRef } from "react";
import { Sun, RefreshCw, CornerUpLeft, Star } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { useTaskStore } from "@/stores/taskStore";
import { navigateToLabel } from "@/router/navigate";
import { insertTask, getIncompleteTaskCount } from "@/services/db/tasks";
import { dismissTaskSuggestion } from "@/services/db/dismissedSuggestions";
import { buildTodayDigest, type TodayDigest, type TaskSuggestion } from "@/services/today/digestManager";
import { StatStrip } from "./StatStrip";
import { DigestBrief } from "./DigestBrief";
import { ThreadMiniList } from "./ThreadMiniList";
import { AgendaPanel } from "./AgendaPanel";
import { TaskSuggestionsPanel } from "./TaskSuggestionsPanel";

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const SYNC_DEBOUNCE_MS = 5000;

export function TodayPage() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.isActive);
  const accountId = activeAccount?.id ?? null;
  const accountEmail = activeAccount?.email ?? "";

  const [digest, setDigest] = useState<TodayDigest | null>(null);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyThreadIds, setBusyThreadIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(
    async (forceAi: boolean) => {
      if (!accountId) {
        setDigest(null);
        setLoading(false);
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (forceAi) setRefreshing(true);
      try {
        const result = await buildTodayDigest(accountId, accountEmail, { forceAi });
        setDigest(result);
        setSuggestions(result.suggestions);
      } catch (err) {
        console.error("[Velo] Today digest failed:", err);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountId, accountEmail],
  );

  // Initial load + reload when the active account changes.
  useEffect(() => {
    setLoading(true);
    load(false);
  }, [load]);

  // Auto-refresh (debounced) when a sync completes.
  useEffect(() => {
    const handler = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(false), SYNC_DEBOUNCE_MS);
    };
    window.addEventListener("velo-sync-done", handler);
    return () => {
      window.removeEventListener("velo-sync-done", handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  const openThread = useCallback((threadId: string) => {
    navigateToLabel("inbox", { threadId });
  }, []);

  const handleAccept = useCallback(
    async (s: TaskSuggestion) => {
      setBusyThreadIds((prev) => new Set(prev).add(s.threadId));
      try {
        await insertTask({
          accountId: s.accountId,
          title: s.title,
          description: s.description,
          priority: s.priority,
          dueDate: s.dueDate,
          threadId: s.threadId,
          threadAccountId: s.accountId,
        });
        const count = await getIncompleteTaskCount(s.accountId);
        useTaskStore.getState().setIncompleteCount(count);
        setSuggestions((prev) => prev.filter((x) => x.threadId !== s.threadId));
      } catch (err) {
        console.error("[Velo] Accept task suggestion failed:", err);
      } finally {
        setBusyThreadIds((prev) => {
          const next = new Set(prev);
          next.delete(s.threadId);
          return next;
        });
      }
    },
    [],
  );

  const handleDismiss = useCallback(async (s: TaskSuggestion) => {
    setSuggestions((prev) => prev.filter((x) => x.threadId !== s.threadId));
    try {
      await dismissTaskSuggestion(s.accountId, s.threadId);
    } catch (err) {
      console.error("[Velo] Dismiss task suggestion failed:", err);
    }
  }, []);

  const now = new Date();

  if (!accountId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        Add an account to see your daily digest.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <Sun size={20} className="text-accent" />
          <div>
            <h1 className="text-base font-semibold text-text-primary leading-tight">
              {greeting(now)}{activeAccount?.email ? `, ${activeAccount.email.split("@")[0]}` : ""}
            </h1>
            <p className="text-xs text-text-tertiary">
              {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary border border-border-primary hover:border-accent disabled:opacity-60"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          <StatStrip stats={digest?.stats ?? { received: 0, unread: 0, awaitingReply: 0 }} vipCount={digest?.vip.length ?? 0} />

          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
            {/* Main column */}
            <div className="space-y-5">
              <DigestBrief
                brief={digest?.brief ?? null}
                error={digest?.briefError ?? null}
                loading={loading || refreshing}
                aiAvailable={digest?.aiAvailable ?? true}
                hasThreads={(digest?.threads.length ?? 0) > 0}
              />

              <TaskSuggestionsPanel
                suggestions={suggestions}
                loading={loading || refreshing}
                aiAvailable={digest?.aiAvailable ?? true}
                error={digest?.suggestionsError ?? null}
                busyThreadIds={busyThreadIds}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                onOpen={openThread}
              />

              <ThreadMiniList
                title="Needs reply"
                icon={CornerUpLeft}
                threads={digest?.needsReply ?? []}
                emptyText="No threads waiting on you today."
                onOpen={openThread}
              />
            </div>

            {/* Side column */}
            <div className="space-y-5">
              <AgendaPanel items={digest?.agenda ?? []} onOpen={openThread} />
              <ThreadMiniList
                title="VIP & important"
                icon={Star}
                threads={digest?.vip ?? []}
                emptyText="Nothing flagged important today."
                onOpen={openThread}
                max={6}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
