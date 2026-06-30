import { useState, useEffect, useCallback, useRef } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { useTaskStore } from "@/stores/taskStore";
import { useComposerStore } from "@/stores/composerStore";
import { navigateToLabel, navigateToSettings } from "@/router/navigate";
import {
  insertTask,
  getIncompleteTaskCount,
  getTodayTasks,
  completeTask,
  type DbTask,
} from "@/services/db/tasks";
import { getMessagesForThread } from "@/services/db/messages";
import { dismissTaskSuggestion, undismissTaskSuggestion } from "@/services/db/dismissedSuggestions";
import { generateAutoDraft } from "@/services/ai/writingStyleService";
import type { ToastData } from "./Toast";
import {
  buildTodayDigest,
  getTodayStartMs,
  type TodayDigest,
  type TaskSuggestion,
} from "@/services/today/digestManager";
import { TodayDashboard } from "./TodayDashboard";

function todayRangeSec(): [number, number] {
  const start = Math.floor(getTodayStartMs(new Date()) / 1000);
  return [start, start + 86400];
}

/** Convert a plain-text AI draft into safe paragraph HTML for the composer. */
function draftToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const SYNC_DEBOUNCE_MS = 5000;

export function TodayPage() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.isActive);
  const accountId = activeAccount?.id ?? null;
  const accountEmail = activeAccount?.email ?? "";

  const [digest, setDigest] = useState<TodayDigest | null>(null);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [todos, setTodos] = useState<DbTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyThreadIds, setBusyThreadIds] = useState<Set<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [draftingThreadId, setDraftingThreadId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const toastIdRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, opts?: { action?: ToastData["action"]; pending?: boolean }) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      const id = ++toastIdRef.current;
      setToast({ id, message, action: opts?.action, pending: opts?.pending });
      if (!opts?.pending) {
        toastTimerRef.current = setTimeout(() => {
          setToast((t) => (t && t.id === id ? null : t));
        }, 6000);
      }
    },
    [],
  );

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

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
        setTodos(result.todayTasks);
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
      // Remove the candidate and pull the new task into today's real to-dos.
      setSuggestions((prev) => prev.filter((x) => x.threadId !== s.threadId));
      const [start, end] = todayRangeSec();
      setTodos(await getTodayTasks(s.accountId, start, end));
      showToast("Added to today's to-dos", {
        action: { label: "View in Tasks", onClick: () => { closeToast(); navigateToLabel("tasks"); } },
      });
    } catch (err) {
      console.error("[Velo] Accept task suggestion failed:", err);
      showToast("Couldn't create the task");
    } finally {
      setBusyThreadIds((prev) => {
        const next = new Set(prev);
        next.delete(s.threadId);
        return next;
      });
    }
  }, [showToast, closeToast]);

  const handleCompleteTodo = useCallback(
    async (taskId: string) => {
      setCompletingIds((prev) => new Set(prev).add(taskId));
      try {
        await completeTask(taskId);
        setTodos((prev) => prev.filter((t) => t.id !== taskId));
        if (accountId) {
          const count = await getIncompleteTaskCount(accountId);
          useTaskStore.getState().setIncompleteCount(count);
        }
      } catch (err) {
        console.error("[Velo] Complete to-do failed:", err);
      } finally {
        setCompletingIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [accountId],
  );

  const handleDismiss = useCallback(async (s: TaskSuggestion) => {
    setSuggestions((prev) => prev.filter((x) => x.threadId !== s.threadId));
    try {
      await dismissTaskSuggestion(s.accountId, s.threadId);
      showToast("Suggestion dismissed", {
        action: {
          label: "Undo",
          onClick: async () => {
            closeToast();
            try {
              await undismissTaskSuggestion(s.accountId, s.threadId);
            } catch (err) {
              console.error("[Velo] Undo dismiss failed:", err);
            }
            setSuggestions((prev) => (prev.some((x) => x.threadId === s.threadId) ? prev : [s, ...prev]));
          },
        },
      });
    } catch (err) {
      console.error("[Velo] Dismiss task suggestion failed:", err);
    }
  }, [showToast, closeToast]);

  const handleDraftReply = useCallback(
    async (threadId: string) => {
      if (!accountId || draftingThreadId) return;
      setDraftingThreadId(threadId);
      showToast("Drafting your reply…", { pending: true });
      try {
        const messages = await getMessagesForThread(accountId, threadId);
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) {
          closeToast();
          return;
        }
        const draft = await generateAutoDraft(threadId, accountId, messages, "reply");
        const replyTo = lastMessage.reply_to ?? lastMessage.from_address;
        useComposerStore.getState().openComposer({
          mode: "reply",
          to: replyTo ? [replyTo] : [],
          subject: `Re: ${lastMessage.subject ?? ""}`,
          bodyHtml: draftToHtml(draft),
          threadId: lastMessage.thread_id,
          inReplyToMessageId: lastMessage.id,
        });
        closeToast();
      } catch (err) {
        console.error("[Velo] Draft reply failed:", err);
        showToast("Couldn't draft a reply");
      } finally {
        setDraftingThreadId(null);
      }
    },
    [accountId, draftingThreadId, showToast, closeToast],
  );

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
      todos={todos}
      loading={loading}
      refreshing={refreshing}
      busyThreadIds={busyThreadIds}
      completingIds={completingIds}
      toast={toast}
      onToastClose={closeToast}
      onRefresh={() => load(true)}
      onOpenThread={openThread}
      onOpenInbox={() => navigateToLabel("inbox")}
      onOpenSettings={() => navigateToSettings("ai")}
      onAcceptSuggestion={handleAccept}
      onDismissSuggestion={handleDismiss}
      onCompleteTodo={handleCompleteTodo}
      onDraftReply={handleDraftReply}
      draftingThreadId={draftingThreadId}
    />
  );
}
