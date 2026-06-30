import { useState } from "react";
import { Sparkles, Loader2, Check, Tag, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { buildInboxProfile } from "@/services/smartTags/inboxProfiler";
import {
  proposeTags,
  createTagFromSuggestion,
  applyNewTags,
  type TagSuggestion,
} from "@/services/smartTags/taxonomyService";

interface SmartTagSetupProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

type Step = "intro" | "loading" | "review" | "creating" | "done";

export function SmartTagSetup({ isOpen, onClose, accountId }: SmartTagSetupProps) {
  const [step, setStep] = useState<Step>("intro");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);

  const analyze = async () => {
    setStep("loading");
    setError(null);
    try {
      const profile = await buildInboxProfile(accountId);
      const tags = await proposeTags(accountId, profile);
      setSuggestions(tags);
      setApproved(new Set(tags.map((t) => t.name)));
      setStep("review");
    } catch (err) {
      console.error("[Velo] Smart tag analysis failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStep("intro");
    }
  };

  const toggle = (name: string) =>
    setApproved((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const create = async () => {
    const toCreate = suggestions.filter((s) => approved.has(s.name));
    if (toCreate.length === 0) return;
    setStep("creating");
    try {
      for (const s of toCreate) await createTagFromSuggestion(accountId, s);
      const applied = await applyNewTags(accountId);
      setCreatedCount(toCreate.length);
      setAppliedCount(applied);
      setStep("done");
    } catch (err) {
      console.error("[Velo] Smart tag creation failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStep("review");
    }
  };

  const close = () => {
    setStep("intro");
    setSuggestions([]);
    setApproved(new Set());
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Smart Tags" width="w-[460px]">
      <div className="p-4">
      {step === "intro" && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Velo will read your inbox, build a quick profile of what you deal with, and suggest a set of
            tags tailored to <em>you</em> — your people, projects, and the things that actually fill your inbox.
            You approve each one before it's created.
          </p>
          {error && <p className="text-sm text-danger">Couldn't analyze: {error}</p>}
          <button
            onClick={analyze}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm font-medium"
          >
            <Sparkles size={16} /> Analyze my inbox
          </button>
        </div>
      )}

      {step === "loading" && (
        <div className="flex items-center gap-3 text-sm text-text-secondary py-8 justify-center">
          <Loader2 size={18} className="animate-spin text-accent" /> Reading your inbox and drafting tags…
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <p className="text-xs text-text-tertiary">
            {approved.size} of {suggestions.length} selected · approve the ones that fit.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {suggestions.map((s) => {
              const on = approved.has(s.name);
              return (
                <button
                  key={s.name}
                  onClick={() => toggle(s.name)}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                    on ? "border-accent bg-accent/5" : "border-border-primary bg-bg-primary/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${
                      on ? "bg-accent border-accent text-white" : "border-border-primary text-transparent"
                    }`}
                  >
                    <Check size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <Tag size={13} className="text-accent shrink-0" />
                      <span className="text-sm font-medium text-text-primary">{s.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">{s.type}</span>
                    </span>
                    <span className="block text-xs text-text-secondary mt-1">{s.rationale}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={analyze}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent"
            >
              <RefreshCw size={13} /> Suggest more
            </button>
            <button
              onClick={create}
              disabled={approved.size === 0}
              className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm font-medium disabled:opacity-50"
            >
              Create {approved.size} tag{approved.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {step === "creating" && (
        <div className="flex items-center gap-3 text-sm text-text-secondary py-8 justify-center">
          <Loader2 size={18} className="animate-spin text-accent" /> Creating tags and applying them to your inbox…
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <Check size={18} className="text-success" />
            Created {createdCount} tag{createdCount === 1 ? "" : "s"} and applied them to {appliedCount} email
            {appliedCount === 1 ? "" : "s"}.
          </div>
          <button onClick={close} className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm font-medium">
            Done
          </button>
        </div>
      )}
      </div>
    </Modal>
  );
}
