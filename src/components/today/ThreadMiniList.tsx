import type { LucideIcon } from "lucide-react";
import { PenLine, Loader2 } from "lucide-react";
import type { TodayThread } from "@/services/today/digestManager";

interface ThreadMiniListProps {
  title: string;
  icon: LucideIcon;
  threads: TodayThread[];
  emptyText: string;
  onOpen: (threadId: string) => void;
  max?: number;
  /** When provided, each row shows a "Draft reply" button. */
  onDraftReply?: (threadId: string) => void;
  draftingThreadId?: string | null;
}

export function ThreadMiniList({
  title,
  icon: Icon,
  threads,
  emptyText,
  onOpen,
  max = 8,
  onDraftReply,
  draftingThreadId,
}: ThreadMiniListProps) {
  const shown = threads.slice(0, max);
  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {threads.length > 0 && (
          <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">{threads.length}</span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-text-tertiary">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((t) => {
            const drafting = draftingThreadId === t.id;
            return (
              <li key={t.id} className="flex items-start gap-1.5 rounded-lg hover:bg-bg-hover transition-colors">
                <button
                  onClick={() => onOpen(t.id)}
                  className="flex-1 min-w-0 text-left px-2.5 py-2 flex items-start gap-2.5"
                >
                  {t.isUnread && <span className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-text-primary truncate font-medium">
                      {t.fromName?.trim() || t.fromAddress || "Unknown"}
                    </span>
                    <span className="block text-sm text-text-secondary truncate">{t.subject}</span>
                    {t.snippet && <span className="block text-xs text-text-tertiary truncate">{t.snippet}</span>}
                  </span>
                </button>
                {onDraftReply && (
                  <button
                    onClick={() => onDraftReply(t.id)}
                    disabled={drafting}
                    title="Draft an AI reply in your writing style"
                    className="shrink-0 mt-1.5 mr-1.5 flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-bg-tertiary text-text-secondary border border-border-primary hover:text-accent hover:border-accent disabled:opacity-60"
                  >
                    {drafting ? <Loader2 size={12} className="animate-spin" /> : <PenLine size={12} />}
                    <span className="hidden sm:inline">{drafting ? "Drafting…" : "Draft reply"}</span>
                  </button>
                )}
              </li>
            );
          })}
          {threads.length > max && (
            <li className="px-2.5 pt-1 text-xs text-text-tertiary">+{threads.length - max} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
