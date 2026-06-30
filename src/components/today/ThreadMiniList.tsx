import type { LucideIcon } from "lucide-react";
import type { TodayThread } from "@/services/today/digestManager";

interface ThreadMiniListProps {
  title: string;
  icon: LucideIcon;
  threads: TodayThread[];
  emptyText: string;
  onOpen: (threadId: string) => void;
  max?: number;
}

export function ThreadMiniList({ title, icon: Icon, threads, emptyText, onOpen, max = 8 }: ThreadMiniListProps) {
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
          {shown.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onOpen(t.id)}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-bg-hover transition-colors flex items-start gap-2.5"
              >
                {t.isUnread && <span className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-text-primary truncate font-medium">
                      {t.fromName?.trim() || t.fromAddress || "Unknown"}
                    </span>
                  </span>
                  <span className="block text-sm text-text-secondary truncate">{t.subject}</span>
                  {t.snippet && <span className="block text-xs text-text-tertiary truncate">{t.snippet}</span>}
                </span>
              </button>
            </li>
          ))}
          {threads.length > max && (
            <li className="px-2.5 pt-1 text-xs text-text-tertiary">+{threads.length - max} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
