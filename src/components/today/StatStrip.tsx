import type { TodayStats } from "@/services/today/digestManager";

export type StatKind = "received" | "unread" | "awaiting";

interface StatStripProps {
  stats: TodayStats;
  onStat?: (kind: StatKind) => void;
}

function Metric({ value, label, onClick }: { value: number; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="font-semibold text-text-primary">{value}</span>{" "}
      <span className="text-text-tertiary">{label}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="hover:text-accent transition-colors">
      {inner}
    </button>
  ) : (
    <span>{inner}</span>
  );
}

/** Thin glance line — no big chip cards; metrics that duplicate sections are dropped. */
export function StatStrip({ stats, onStat }: StatStripProps) {
  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm text-text-secondary px-1">
      <Metric value={stats.received} label="received today" onClick={onStat && (() => onStat("received"))} />
      <span className="text-border-primary">·</span>
      <Metric value={stats.unread} label="unread" onClick={onStat && (() => onStat("unread"))} />
      <span className="text-border-primary">·</span>
      <Metric value={stats.awaitingReply} label="to respond" onClick={onStat && (() => onStat("awaiting"))} />
    </div>
  );
}
