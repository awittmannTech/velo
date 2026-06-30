import { ListChecks, Check, X, Loader2, Circle, Mail } from "lucide-react";
import type { TaskSuggestion } from "@/services/today/digestManager";
import type { DbTask, TaskPriority } from "@/services/db/tasks";

interface TodayTodosPanelProps {
  aiAvailable: boolean;
  loading: boolean;
  suggestions: TaskSuggestion[];
  todos: DbTask[];
  suggestionsError: string | null;
  busyThreadIds: Set<string>;
  completingIds: Set<string>;
  onAccept: (s: TaskSuggestion) => void;
  onDismiss: (s: TaskSuggestion) => void;
  onCompleteTodo: (taskId: string) => void;
  onOpenThread: (threadId: string) => void;
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

function PriorityDue({ priority, dueDate }: { priority: TaskPriority; dueDate: number | null }) {
  const due = formatDue(dueDate);
  if (priority === "none" && !due) return null;
  return (
    <div className="mt-1 flex items-center gap-2">
      {priority !== "none" && (
        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${PRIORITY_STYLE[priority]}`}>
          {priority}
        </span>
      )}
      {due && <span className="text-[11px] text-text-tertiary">Due {due}</span>}
    </div>
  );
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
  const who = s.fromName?.trim() || s.fromAddress || null;
  return (
    <div className="rounded-lg border border-border-primary bg-bg-primary/40 px-3 py-2.5 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {who && (
          <button onClick={() => onOpen(s.threadId)} className="block max-w-full truncate text-[11px] text-accent hover:underline">
            {who}
          </button>
        )}
        <span className="block text-sm font-medium text-text-primary line-clamp-2 leading-snug">{s.title}</span>
        <PriorityDue priority={s.priority} dueDate={s.dueDate} />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onAccept(s)}
          disabled={busy}
          title="Add to today's to-dos"
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

function TodoRow({
  task,
  completing,
  onComplete,
  onOpen,
}: {
  task: DbTask;
  completing: boolean;
  onComplete: (id: string) => void;
  onOpen: (threadId: string) => void;
}) {
  return (
    <div className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors">
      <button
        onClick={() => onComplete(task.id)}
        disabled={completing}
        title="Complete"
        className="mt-0.5 shrink-0 text-text-tertiary hover:text-accent disabled:opacity-50"
      >
        {completing ? <Loader2 size={16} className="animate-spin" /> : <Circle size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <span className="block text-sm text-text-primary line-clamp-2 leading-snug">{task.title}</span>
        <PriorityDue priority={task.priority} dueDate={task.due_date} />
      </div>
      {task.thread_id && (
        <button
          onClick={() => onOpen(task.thread_id!)}
          title="Open email"
          className="mt-0.5 shrink-0 text-text-tertiary hover:text-accent"
        >
          <Mail size={14} />
        </button>
      )}
    </div>
  );
}

export function TodayTodosPanel({
  aiAvailable,
  loading,
  suggestions,
  todos,
  suggestionsError,
  busyThreadIds,
  completingIds,
  onAccept,
  onDismiss,
  onCompleteTodo,
  onOpenThread,
}: TodayTodosPanelProps) {
  const showSuggested = aiAvailable;
  const empty = suggestions.length === 0 && todos.length === 0;

  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">To-dos</h2>
        {todos.length > 0 && (
          <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">{todos.length}</span>
        )}
      </div>

      {/* Suggested candidates */}
      {showSuggested && (suggestions.length > 0 || (loading && todos.length === 0)) && (
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-wide text-text-tertiary mb-2">Could be a to-do</p>
          {loading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-text-tertiary">
              <Loader2 size={14} className="animate-spin" />
              Scanning today's threads…
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.threadId}
                  s={s}
                  busy={busyThreadIds.has(s.threadId)}
                  onAccept={onAccept}
                  onDismiss={onDismiss}
                  onOpen={onOpenThread}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {showSuggested && suggestionsError && suggestions.length === 0 && !loading && (
        <p className="mb-4 text-xs text-text-tertiary">Couldn't generate suggestions ({suggestionsError}).</p>
      )}

      {/* Real to-dos */}
      <div>
        {(suggestions.length > 0 || showSuggested) && (
          <p className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1.5">Today</p>
        )}
        {todos.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            {empty ? "No to-dos yet — accept a suggestion or add one from any email." : "Nothing on your list for today yet."}
          </p>
        ) : (
          <div className="space-y-0.5">
            {todos.map((task) => (
              <TodoRow
                key={task.id}
                task={task}
                completing={completingIds.has(task.id)}
                onComplete={onCompleteTodo}
                onOpen={onOpenThread}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
