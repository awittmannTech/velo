import { useState } from "react";
import { Sparkles, Loader2, Settings2, CornerUpLeft, Eye, ChevronRight, ChevronDown } from "lucide-react";
import type { TodayThread } from "@/services/today/digestManager";
import { ThreadRow } from "./ThreadRow";

interface DayPanelProps {
  brief: string | null;
  briefError: string | null;
  loading: boolean;
  aiAvailable: boolean;
  hasThreads: boolean;
  onOpenSettings: () => void;
  toRespond: TodayThread[];
  fyi: TodayThread[];
  onOpenThread: (threadId: string) => void;
  onDraftReply: (threadId: string) => void;
  draftingThreadId: string | null;
}

const FYI_MAX = 15;

/** Collapse the brief into a single skimmable line. */
function briefLine(brief: string): string {
  return brief
    .split("\n")
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .join(" ");
}

export function DayPanel({
  brief,
  briefError,
  loading,
  aiAvailable,
  hasThreads,
  onOpenSettings,
  toRespond,
  fyi,
  onOpenThread,
  onDraftReply,
  draftingThreadId,
}: DayPanelProps) {
  const [fyiOpen, setFyiOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5">
      {/* Brief one-liner */}
      <div className="flex items-start gap-2">
        <Sparkles size={16} className="text-accent mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary leading-tight">Your day</h2>
          <div className="mt-0.5 text-sm text-text-secondary">
            {!aiAvailable ? (
              <span className="text-text-tertiary">
                <button onClick={onOpenSettings} className="text-accent hover:underline">Enable AI</button> for a daily brief.
              </span>
            ) : loading && !brief ? (
              <span className="inline-flex items-center gap-1.5 text-text-tertiary">
                <Loader2 size={13} className="animate-spin" /> Writing your brief…
              </span>
            ) : briefError ? (
              <span className="text-text-tertiary inline-flex items-center gap-1.5">
                <Settings2 size={13} /> Brief unavailable.
              </span>
            ) : brief ? (
              briefLine(brief)
            ) : !hasThreads ? (
              <span className="text-text-tertiary">No new mail today — enjoy the quiet. 🌤️</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* To respond */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-1.5">
          <CornerUpLeft size={14} className="text-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">To respond</h3>
          {toRespond.length > 0 && (
            <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">{toRespond.length}</span>
          )}
        </div>
        {toRespond.length === 0 ? (
          <p className="text-sm text-text-tertiary px-2.5 py-1">Nothing needs your reply right now. ✅</p>
        ) : (
          <ul className="space-y-1">
            {toRespond.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                onOpen={onOpenThread}
                onDraftReply={aiAvailable ? onDraftReply : undefined}
                drafting={draftingThreadId === t.id}
              />
            ))}
          </ul>
        )}
      </div>

      {/* FYI · alerts & updates (collapsible) */}
      {fyi.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border-primary/60">
          <button
            onClick={() => setFyiOpen((o) => !o)}
            className="w-full flex items-center gap-2 text-left"
          >
            {fyiOpen ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronRight size={14} className="text-text-tertiary" />}
            <Eye size={14} className="text-text-tertiary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">FYI · alerts &amp; updates</h3>
            <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">{fyi.length}</span>
          </button>
          {fyiOpen && (
            <ul className="mt-1.5 space-y-0.5">
              {fyi.slice(0, FYI_MAX).map((t) => (
                <ThreadRow key={t.id} thread={t} onOpen={onOpenThread} compact />
              ))}
              {fyi.length > FYI_MAX && (
                <li className="px-2.5 pt-1 text-xs text-text-tertiary">+{fyi.length - FYI_MAX} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
