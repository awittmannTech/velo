import { useState } from "react";
import { Archive, MailX, MoreHorizontal, Loader2, Check } from "lucide-react";
import type { SenderCluster } from "@/services/db/cleanup";

interface SenderClusterRowProps {
  cluster: SenderCluster;
  selected: boolean;
  busy: boolean;
  onToggleSelect: (address: string) => void;
  onArchive: (cluster: SenderCluster) => void;
  onUnsubscribe: (cluster: SenderCluster) => void;
  onAlwaysArchive: (cluster: SenderCluster) => void;
}

function relativeDate(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function SenderClusterRow({
  cluster,
  selected,
  busy,
  onToggleSelect,
  onArchive,
  onUnsubscribe,
  onAlwaysArchive,
}: SenderClusterRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const label = cluster.name?.trim() || cluster.address;
  const initial = (label[0] ?? "?").toUpperCase();

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors">
      <button
        onClick={() => onToggleSelect(cluster.address)}
        className={`w-4.5 h-4.5 shrink-0 rounded border flex items-center justify-center ${
          selected ? "bg-accent border-accent text-white" : "border-border-primary text-transparent"
        }`}
        style={{ width: 18, height: 18 }}
        title="Select"
      >
        <Check size={12} />
      </button>

      <div className="w-8 h-8 shrink-0 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-medium text-text-secondary">
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">{label}</span>
          {cluster.hasUnsubscribe && (
            <span className="text-[10px] uppercase tracking-wide text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded shrink-0">
              newsletter
            </span>
          )}
        </div>
        <div className="text-xs text-text-tertiary truncate">
          {cluster.address !== label ? `${cluster.address} · ` : ""}
          last {relativeDate(cluster.lastReceived)}
        </div>
      </div>

      <div className="shrink-0 text-right mr-1">
        <div className="text-sm font-semibold text-text-primary">{cluster.count}</div>
        {cluster.unreadCount > 0 && <div className="text-[11px] text-accent">{cluster.unreadCount} unread</div>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onArchive(cluster)}
          disabled={busy}
          title="Archive all from this sender"
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-bg-tertiary text-text-primary border border-border-primary hover:border-accent disabled:opacity-60"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
          <span className="hidden sm:inline">Archive</span>
        </button>
        {cluster.hasUnsubscribe && (
          <button
            onClick={() => onUnsubscribe(cluster)}
            disabled={busy}
            title="Unsubscribe and archive all"
            className="flex items-center justify-center w-8 h-8 rounded-md bg-bg-tertiary text-text-secondary border border-border-primary hover:text-danger hover:border-danger disabled:opacity-60"
          >
            <MailX size={14} />
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
            title="More"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-52 rounded-lg bg-bg-secondary border border-border-primary shadow-xl py-1">
                <button
                  onClick={() => { setMenuOpen(false); onAlwaysArchive(cluster); }}
                  className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-hover"
                >
                  Always archive from this sender
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
