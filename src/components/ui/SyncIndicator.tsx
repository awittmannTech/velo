import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import type { SyncProgress } from "@/services/gmail/sync";

export type SyncIndicatorState = "idle" | "syncing" | "success" | "error";

/**
 * Build a short, human-readable label from a sync progress payload.
 * Pure helper — colocated tests cover the phase mapping.
 */
export function syncProgressLabel(progress?: SyncProgress): string {
  if (!progress) return "Syncing…";
  switch (progress.phase) {
    case "messages":
      return `Syncing ${progress.current}/${progress.total} messages`;
    case "labels":
      return "Syncing labels…";
    case "threads":
      return `Building threads ${progress.current}/${progress.total}`;
    default:
      return "Syncing…";
  }
}

interface SyncIndicatorProps {
  state: SyncIndicatorState;
  /** Accessible label / tooltip describing the current sync status. */
  label?: string;
}

/**
 * Subtle, animated sync indicator pinned to the bottom-right corner.
 *
 * - `syncing`  → a small spinner
 * - `success`  → morphs into a checkmark
 * - `error`    → a soft alert icon
 * - `idle`     → gently fades/scales out (and stays out)
 *
 * The chip stays mounted while idle so the fade-out transition can play; the
 * last active icon is retained during that fade so it doesn't flicker.
 */
export function SyncIndicator({ state, label }: SyncIndicatorProps) {
  // Retain the last active state so the icon stays put while the chip fades out.
  const [displayState, setDisplayState] =
    useState<Exclude<SyncIndicatorState, "idle">>("syncing");

  useEffect(() => {
    if (state !== "idle") setDisplayState(state);
  }, [state]);

  const visible = state !== "idle";

  let icon;
  if (displayState === "success") {
    icon = <Check size={14} className="text-success" />;
  } else if (displayState === "error") {
    icon = <AlertCircle size={14} className="text-danger" />;
  } else {
    icon = <Loader2 size={14} className="animate-spin text-text-tertiary" />;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      title={label}
      className={`fixed bottom-4 right-4 z-40 flex h-7 w-7 items-center justify-center rounded-full border border-border-primary bg-bg-secondary shadow-md transition-all duration-500 ease-out ${
        visible
          ? "opacity-100 scale-100"
          : "pointer-events-none opacity-0 scale-90"
      }`}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </div>
  );
}
