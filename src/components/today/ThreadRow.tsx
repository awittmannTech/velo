import { PenLine, Loader2, Star } from "lucide-react";
import type { TodayThread } from "@/services/today/digestManager";

interface ThreadRowProps {
  thread: TodayThread;
  onOpen: (threadId: string) => void;
  /** Compact rows hide the snippet (used for the FYI list). */
  compact?: boolean;
  onDraftReply?: (threadId: string) => void;
  drafting?: boolean;
}

export function ThreadRow({ thread, onOpen, compact, onDraftReply, drafting }: ThreadRowProps) {
  return (
    <li className="flex items-start gap-1.5 rounded-lg hover:bg-bg-hover transition-colors">
      <button
        onClick={() => onOpen(thread.id)}
        className={`flex-1 min-w-0 text-left px-2.5 flex items-start gap-2.5 ${compact ? "py-1.5" : "py-2"}`}
      >
        {thread.isUnread && <span className={`${compact ? "mt-1" : "mt-1.5"} w-2 h-2 rounded-full bg-accent shrink-0`} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm text-text-primary font-medium">
            {thread.isVip && <Star size={12} className="text-warning fill-warning shrink-0" />}
            <span className="truncate">{thread.fromName?.trim() || thread.fromAddress || "Unknown"}</span>
          </span>
          <span className="block text-sm text-text-secondary truncate">{thread.subject}</span>
          {!compact && thread.snippet && (
            <span className="block text-xs text-text-tertiary truncate">{thread.snippet}</span>
          )}
        </span>
      </button>
      {onDraftReply && (
        <button
          onClick={() => onDraftReply(thread.id)}
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
}
