import { X, Loader2 } from "lucide-react";

export interface ToastData {
  id: number;
  message: string;
  /** Optional action button (e.g. Undo / View in Tasks). */
  action?: { label: string; onClick: () => void };
  /** Show a spinner instead of a close button (e.g. "Drafting…"). */
  pending?: boolean;
}

export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-bg-secondary border border-border-primary shadow-xl">
      {toast.pending && <Loader2 size={14} className="animate-spin text-accent shrink-0" />}
      <span className="text-sm text-text-primary">{toast.message}</span>
      {toast.action && (
        <button onClick={toast.action.onClick} className="text-sm font-medium text-accent hover:underline shrink-0">
          {toast.action.label}
        </button>
      )}
      {!toast.pending && (
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary shrink-0" title="Dismiss">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
