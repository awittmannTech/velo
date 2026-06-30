import { ListChecks, Check, X, Loader2 } from "lucide-react";
import type { TaskSuggestion } from "@/services/today/digestManager";
import type { TaskPriority } from "@/services/db/tasks";

interface TaskSuggestionsPanelProps {
  suggestions: TaskSuggestion[];
  loading: boolean;
  aiAvailable: boolean;
  error: string | null;
  busyThreadIds: Set<string>;
  onAccept: (s: TaskSuggestion) => void;
  onDismiss: (s: TaskSuggestion) => void;
  onOpen: (threadId: string) => void;
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  urgent: "bg-danger/15 text-danger",
  high: "bg-warning/15 text-warning",
  medium: "bg-accent/15 text-accent",
  low: "bg-bg-tertiary text-text-tertiary",
  none: "bg-bg-tertiary text-text-tertiary",
};

function formatDue(seconds: number | null): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SuggestionCard({
  s,
  busy,
  onAccept,
  onDismiss,
  onOpen,
}: {
  s: TaskSuggestion;
  busy: boolean;
  onAccept: (s: TaskSuggestion) => void;
  onDismiss: (s: TaskSuggestion) => void;
  onOpen: (threadId: string) => void;
}) {
  const due = formatDue(s.dueDate);
  return (
    <div className="rounded-lg border border-border-primary bg-bg-primary/40 px-3 py-2.5 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <button onClick={() => onOpen(s.threadId)} className="block w-full text-left">
          <span className="block text-sm font-medium text-text-primary line-clamp-2 leading-snug">{s.title}</span>
        </button>
        {(s.priority !== "none" || due) && (
          <div className="mt-1 flex items-center gap-2">
            {s.priority !== "none" && (
              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${PRIORITY_STYLE[s.priority]}`}>
                {s.priority}
              </span>
            )}
            {due && <span className="text-[11px] text-text-tertiary">Due {due}</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onAccept(s)}
          disabled={busy}
          title="Create task"
          className="w-6 h-6 flex items-center justify-center rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button
          onClick={() => onDismiss(s)}
          disabled={busy}
          title="Dismiss"
          className="w-6 h-6 flex items-center justify-center rounded-md bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary disabled:opacity-50"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

export function TaskSuggestionsPanel({
  suggestions,
  loading,
  aiAvailable,
  error,
  busyThreadIds,
  onAccept,
  onDismiss,
  onOpen,
}: TaskSuggestionsPanelProps) {
  if (!aiAvailable) return null;

  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Suggested tasks</h2>
        {suggestions.length > 0 && (
          <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">{suggestions.length}</span>
        )}
      </div>

      {loading && suggestions.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Loader2 size={15} className="animate-spin" />
          Scanning today's threads…
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          {error ? `Couldn't generate suggestions (${error}).` : "Nothing to suggest right now — you're on top of it. ✅"}
        </p>
      ) : (
        <div className="space-y-2.5">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.threadId}
              s={s}
              busy={busyThreadIds.has(s.threadId)}
              onAccept={onAccept}
              onDismiss={onDismiss}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}
