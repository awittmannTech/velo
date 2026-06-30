import { useState, useEffect, useCallback, useRef } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { useTaskStore } from "@/stores/taskStore";
import { navigateToLabel, navigateToSettings } from "@/router/navigate";
import { insertTask, getIncompleteTaskCount } from "@/services/db/tasks";
import { dismissTaskSuggestion } from "@/services/db/dismissedSuggestions";
import { buildTodayDigest, type TodayDigest, type TaskSuggestion } from "@/services/today/digestManager";
import { TodayDashboard } from "./TodayDashboard";

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

  const handleAccept = useCallback(async (s: TaskSuggestion) => {
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
  }, []);

  const handleDismiss = useCallback(async (s: TaskSuggestion) => {
    setSuggestions((prev) => prev.filter((x) => x.threadId !== s.threadId));
    try {
      await dismissTaskSuggestion(s.accountId, s.threadId);
    } catch (err) {
      console.error("[Velo] Dismiss task suggestion failed:", err);
    }
  }, []);

  if (!accountId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        Add an account to see your daily digest.
      </div>
    );
  }

  return (
    <TodayDashboard
      now={new Date()}
      greetingName={accountEmail ? accountEmail.split("@")[0]! : ""}
      digest={digest}
      suggestions={suggestions}
      loading={loading}
      refreshing={refreshing}
      busyThreadIds={busyThreadIds}
      onRefresh={() => load(true)}
      onOpenThread={openThread}
      onOpenSettings={() => navigateToSettings("ai")}
      onAcceptSuggestion={handleAccept}
      onDismissSuggestion={handleDismiss}
    />
  );
}
