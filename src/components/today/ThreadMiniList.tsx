import type { LucideIcon } from "lucide-react";
import type { TodayThread } from "@/services/today/digestManager";
import { ThreadRow } from "./ThreadRow";

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
            <ThreadRow key={t.id} thread={t} onOpen={onOpen} />
          ))}
          {threads.length > max && (
            <li className="px-2.5 pt-1 text-xs text-text-tertiary">+{threads.length - max} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
