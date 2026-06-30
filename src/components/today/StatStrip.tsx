import { Inbox, MailOpen, CornerUpLeft, Star } from "lucide-react";
import type { TodayStats } from "@/services/today/digestManager";

export type StatKind = "received" | "unread" | "awaiting" | "important";

interface StatStripProps {
  stats: TodayStats;
  vipCount: number;
  onStat?: (kind: StatKind) => void;
}

function Stat({
  icon,
  value,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  onClick?: () => void;
}) {
  const base =
    "flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-bg-secondary/60 border border-border-primary text-left";
  const body = (
    <>
      <div className="text-accent">{icon}</div>
      <div className="leading-tight">
        <div className="text-lg font-semibold text-text-primary">{value}</div>
        <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
      </div>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className={`${base} hover:border-accent transition-colors`}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}

export function StatStrip({ stats, vipCount, onStat }: StatStripProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Stat icon={<Inbox size={18} />} value={stats.received} label="Received" onClick={onStat && (() => onStat("received"))} />
      <Stat icon={<MailOpen size={18} />} value={stats.unread} label="Unread" onClick={onStat && (() => onStat("unread"))} />
      <Stat icon={<CornerUpLeft size={18} />} value={stats.awaitingReply} label="Awaiting you" onClick={onStat && (() => onStat("awaiting"))} />
      <Stat icon={<Star size={18} />} value={vipCount} label="Important" onClick={onStat && (() => onStat("important"))} />
    </div>
  );
}
