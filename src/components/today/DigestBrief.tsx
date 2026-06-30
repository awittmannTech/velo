import { Sparkles, Loader2, AlertCircle, Settings2 } from "lucide-react";

interface DigestBriefProps {
  brief: string | null;
  error: string | null;
  loading: boolean;
  aiAvailable: boolean;
  hasThreads: boolean;
  onOpenSettings: () => void;
}

export function DigestBrief({ brief, error, loading, aiAvailable, hasThreads, onOpenSettings }: DigestBriefProps) {
  return (
    <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Your day</h2>
      </div>

      {!aiAvailable ? (
        <div className="flex items-start gap-2 text-sm text-text-secondary">
          <Settings2 size={15} className="mt-0.5 shrink-0 text-text-tertiary" />
          <p>
            Enable an AI provider in{" "}
            <button onClick={onOpenSettings} className="text-accent hover:underline">
              Settings &rsaquo; AI
            </button>{" "}
            to get a written brief of your day and task suggestions.
          </p>
        </div>
      ) : loading && !brief ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Loader2 size={15} className="animate-spin" />
          Writing your brief…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-sm text-text-secondary">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-warning" />
          <span>Couldn't generate a brief ({error}). Your panels below are still up to date.</span>
        </div>
      ) : !hasThreads ? (
        <p className="text-sm text-text-tertiary">No new mail today yet — enjoy the quiet. 🌤️</p>
      ) : brief ? (
        <div className="space-y-1.5 text-sm leading-relaxed text-text-secondary">
          {brief
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, i) => {
              const bullet = line.startsWith("- ") || line.startsWith("• ");
              const text = bullet ? line.replace(/^[-•]\s*/, "") : line;
              return (
                <p key={i} className={bullet ? "flex gap-2" : ""}>
                  {bullet && <span className="text-accent">•</span>}
                  <span>{text}</span>
                </p>
              );
            })}
        </div>
      ) : null}
    </section>
  );
}
