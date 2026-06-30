import { Inbox, MailOpen, CornerUpLeft, Star } from "lucide-react";
import type { TodayStats } from "@/services/today/digestManager";

interface StatStripProps {
  stats: TodayStats;
  vipCount: number;
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-bg-secondary/60 border border-border-primary">
      <div className="text-accent">{icon}</div>
      <div className="leading-tight">
        <div className="text-lg font-semibold text-text-primary">{value}</div>
        <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
      </div>
    </div>
  );
}

export function StatStrip({ stats, vipCount }: StatStripProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Stat icon={<Inbox size={18} />} value={stats.received} label="Received" />
      <Stat icon={<MailOpen size={18} />} value={stats.unread} label="Unread" />
      <Stat icon={<CornerUpLeft size={18} />} value={stats.awaitingReply} label="Awaiting you" />
      <Stat icon={<Star size={18} />} value={vipCount} label="Important" />
    </div>
  );
}
