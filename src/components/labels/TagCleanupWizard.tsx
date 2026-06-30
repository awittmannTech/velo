import { useState } from "react";
import { Loader2, Check, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  proposeTagMerges,
  applyTagMerges,
  type TagMergeProposal,
  type MergeAction,
} from "@/services/smartTags/tagMergeService";

interface TagCleanupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

type Step = "intro" | "loading" | "review" | "applying" | "done";

const ACTION_LABEL: Record<MergeAction, string> = { keep: "Keep", merge: "Merge", delete: "Delete" };

export function TagCleanupWizard({ isOpen, onClose, accountId }: TagCleanupWizardProps) {
  const [step, setStep] = useState<Step>("intro");
  const [proposals, setProposals] = useState<TagMergeProposal[]>([]);
  const [result, setResult] = useState({ merged: 0, deleted: 0 });
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setStep("loading");
    setError(null);
    try {
      const p = await proposeTagMerges(accountId);
      setProposals(p);
      setStep("review");
    } catch (err) {
      console.error("[Velo] Tag merge proposal failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStep("intro");
    }
  };

  const setAction = (labelId: string, action: MergeAction) =>
    setProposals((prev) =>
      prev.map((p) => {
        if (p.labelId !== labelId) return p;
        if (action === "merge") {
          const target = p.targetLabelId ? p : prev.find((o) => o.labelId !== labelId);
          return {
            ...p,
            action,
            targetLabelId: p.targetLabelId ?? target?.labelId ?? null,
            targetName: p.targetName ?? (target && "name" in target ? target.name : null),
          };
        }
        return { ...p, action, targetLabelId: null, targetName: null };
      }),
    );

  const setTarget = (labelId: string, targetLabelId: string) =>
    setProposals((prev) =>
      prev.map((p) =>
        p.labelId === labelId
          ? { ...p, targetLabelId, targetName: prev.find((o) => o.labelId === targetLabelId)?.name ?? null }
          : p,
      ),
    );

  const apply = async () => {
    setStep("applying");
    try {
      setResult(await applyTagMerges(accountId, proposals));
      setStep("done");
    } catch (err) {
      console.error("[Velo] Tag merge apply failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStep("review");
    }
  };

  const close = () => {
    setStep("intro");
    setProposals([]);
    setError(null);
    onClose();
  };

  const changes = proposals.filter((p) => p.action !== "keep").length;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Tidy up tags">
      {step === "intro" && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Velo will review your existing tags and suggest which to <strong>keep</strong>, <strong>merge</strong> into
            another, or <strong>delete</strong> — so you end up with a clean, useful set. You approve the plan before anything changes.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button onClick={analyze} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm font-medium">
            <Wand2 size={16} /> Review my tags
          </button>
        </div>
      )}

      {step === "loading" && (
        <div className="flex items-center gap-3 text-sm text-text-secondary py-8 justify-center">
          <Loader2 size={18} className="animate-spin text-accent" /> Reviewing your tags…
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          {proposals.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4">You don't have any custom tags to clean up.</p>
          ) : (
            <>
              <p className="text-xs text-text-tertiary">{changes} change{changes === 1 ? "" : "s"} proposed · adjust anything below.</p>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                {proposals.map((p) => (
                  <div key={p.labelId} className="flex items-center gap-3 p-2.5 rounded-lg border border-border-primary bg-bg-primary/30">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-text-primary truncate block">{p.name}</span>
                      <span className="text-xs text-text-tertiary">{p.count} email{p.count === 1 ? "" : "s"}</span>
                    </div>
                    {p.action === "merge" && (
                      <select
                        value={p.targetLabelId ?? ""}
                        onChange={(e) => setTarget(p.labelId, e.target.value)}
                        className="text-xs bg-bg-tertiary text-text-primary border border-border-primary rounded-md px-2 py-1 max-w-[8rem]"
                      >
                        {proposals.filter((o) => o.labelId !== p.labelId).map((o) => (
                          <option key={o.labelId} value={o.labelId}>{o.name}</option>
                        ))}
                      </select>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {(["keep", "merge", "delete"] as MergeAction[]).map((a) => (
                        <button
                          key={a}
                          onClick={() => setAction(p.labelId, a)}
                          className={`text-xs px-2 py-1 rounded-md border ${
                            p.action === a
                              ? a === "delete" ? "bg-danger/15 text-danger border-danger/40" : "bg-accent text-white border-accent"
                              : "bg-bg-tertiary text-text-secondary border-border-primary"
                          }`}
                        >
                          {ACTION_LABEL[a]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <button onClick={apply} className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm font-medium">
                  Apply {changes} change{changes === 1 ? "" : "s"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === "applying" && (
        <div className="flex items-center gap-3 text-sm text-text-secondary py-8 justify-center">
          <Loader2 size={18} className="animate-spin text-accent" /> Tidying your tags…
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-sm text-text-primary">
            <Check size={18} className="text-success" />
            Merged {result.merged} and deleted {result.deleted} tag{result.deleted === 1 ? "" : "s"}.
          </div>
          <button onClick={close} className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm font-medium">Done</button>
        </div>
      )}
    </Modal>
  );
}
