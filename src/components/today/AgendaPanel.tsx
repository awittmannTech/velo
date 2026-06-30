import { CalendarDays, Clock, CornerUpLeft } from "lucide-react";
import type { AgendaItem } from "@/services/today/digestManager";

interface AgendaPanelProps {
  items: AgendaItem[];
  onOpen: (threadId: string) => void;
}

function formatTime(seconds: number | null): string {
  if (!seconds) return "All day";
  return new Date(seconds * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function AgendaPanel({ items, onOpen }: AgendaPanelProps) {
  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Today's agenda</h2>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-text-tertiary">No events or follow-ups due today.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => {
            const Icon = item.kind === "event" ? Clock : CornerUpLeft;
            const clickable = item.kind === "followup" && item.threadId;
            const content = (
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon size={14} className="text-text-tertiary shrink-0" />
                <span className="text-xs tabular-nums text-text-tertiary w-16 shrink-0">{formatTime(item.time)}</span>
                <span className="text-sm text-text-secondary truncate">{item.title}</span>
              </span>
            );
            return (
              <li key={`${item.kind}-${i}`}>
                {clickable ? (
                  <button
                    onClick={() => onOpen(item.threadId!)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="px-2 py-1.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
