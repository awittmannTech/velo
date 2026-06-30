import { useState, useEffect, useCallback, useRef } from "react";
import { Eraser, RefreshCw, Archive, Loader2, Trash2 } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { Toast, type ToastData } from "@/components/today/Toast";
import type { SenderCluster } from "@/services/db/cleanup";
import {
  loadCleanup,
  previewAgeSweep,
  archiveSenders,
  archiveOlderThan,
  unsubscribeAndArchive,
  alwaysArchiveSender,
  type CleanupData,
} from "@/services/cleanup/cleanupManager";
import { SenderClusterRow } from "./SenderClusterRow";

const SWEEP_OPTIONS = [30, 90, 180];

export function CleanupPage() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.isActive);
  const accountId = activeAccount?.id ?? null;

  const [data, setData] = useState<CleanupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyAddress, setBusyAddress] = useState<string | null>(null);
  const [sweepDays, setSweepDays] = useState(90);
  const [sweepReadOnly, setSweepReadOnly] = useState(true);
  const [sweepCount, setSweepCount] = useState<number | null>(null);
  const [confirmingSweep, setConfirmingSweep] = useState(false);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastId = useRef(0);

  const closeToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const showToast = useCallback((message: string, action?: ToastData["action"]) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const id = ++toastId.current;
    setToast({ id, message, action });
    toastTimer.current = setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 8000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const reload = useCallback(async () => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    try {
      setData(await loadCleanup(accountId));
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { reload(); }, [reload]);

  // Live preview of the age sweep count.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setSweepCount(null);
    previewAgeSweep(accountId, sweepDays, sweepReadOnly).then((n) => { if (!cancelled) setSweepCount(n); });
    return () => { cancelled = true; };
  }, [accountId, sweepDays, sweepReadOnly]);

  const removeSenders = (addresses: string[]) => {
    const set = new Set(addresses.map((a) => a.toLowerCase()));
    setData((d) =>
      d ? { ...d, senders: d.senders.filter((s) => !set.has(s.address.toLowerCase())) } : d,
    );
  };

  const runArchiveSenders = useCallback(
    async (clusters: SenderCluster[], unsubscribe: boolean) => {
      if (!accountId || clusters.length === 0) return;
      const addresses = clusters.map((c) => c.address);
      setBusyAddress(addresses[0]!);
      try {
        let unsubCount = 0;
        let total = 0;
        if (unsubscribe && clusters.length === 1) {
          const { unsubscribed, result } = await unsubscribeAndArchive(accountId, addresses[0]!);
          total = result.count;
          if (unsubscribed) unsubCount = 1;
          removeSenders(addresses);
          showToast(
            unsubscribed ? `Unsubscribed and archived ${total}` : `Archived ${total}`,
            { label: "Undo", onClick: async () => { closeToast(); await result.undo(); reload(); } },
          );
        } else {
          const result = await archiveSenders(accountId, addresses);
          total = result.count;
          removeSenders(addresses);
          showToast(`Archived ${total} from ${clusters.length} sender${clusters.length > 1 ? "s" : ""}`, {
            label: "Undo",
            onClick: async () => { closeToast(); await result.undo(); reload(); },
          });
        }
        void unsubCount;
      } catch (err) {
        console.error("[Velo] Cleanup archive failed:", err);
        showToast("Cleanup failed");
      } finally {
        setBusyAddress(null);
      }
    },
    [accountId, showToast, closeToast, reload],
  );

  const handleAlwaysArchive = useCallback(
    async (cluster: SenderCluster) => {
      if (!accountId) return;
      try {
        await alwaysArchiveSender(accountId, cluster.address, cluster.name);
        showToast(`Future mail from ${cluster.name?.trim() || cluster.address} will be archived`);
      } catch (err) {
        console.error("[Velo] Always-archive rule failed:", err);
      }
    },
    [accountId, showToast],
  );

  const handleSweep = useCallback(async () => {
    if (!accountId) return;
    setConfirmingSweep(false);
    setSweepBusy(true);
    try {
      const result = await archiveOlderThan(accountId, sweepDays, sweepReadOnly);
      showToast(`Archived ${result.count} older than ${sweepDays} days`, {
        label: "Undo",
        onClick: async () => { closeToast(); await result.undo(); reload(); },
      });
      reload();
    } catch (err) {
      console.error("[Velo] Age sweep failed:", err);
      showToast("Sweep failed");
    } finally {
      setSweepBusy(false);
    }
  }, [accountId, sweepDays, sweepReadOnly, showToast, closeToast, reload]);

  const toggleSelect = (address: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(address) ? next.delete(address) : next.add(address);
      return next;
    });

  if (!accountId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        Add an account to clean up your inbox.
      </div>
    );
  }

  const senders = data?.senders ?? [];
  const selectedClusters = senders.filter((s) => selected.has(s.address));

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <Eraser size={20} className="text-accent shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-text-primary leading-tight">Clean up</h1>
            <p className="text-xs text-text-tertiary">{data ? `${data.inboxCount} in your inbox` : "…"}</p>
          </div>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary border border-border-primary hover:border-accent disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Age sweep */}
          <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Archive old mail</h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                {SWEEP_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSweepDays(d)}
                    className={`text-xs px-2.5 py-1.5 rounded-md border ${
                      sweepDays === d ? "bg-accent text-white border-accent" : "bg-bg-tertiary text-text-primary border-border-primary"
                    }`}
                  >
                    &gt; {d}d
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                <input type="checkbox" checked={sweepReadOnly} onChange={(e) => setSweepReadOnly(e.target.checked)} />
                Read only
              </label>
              <div className="flex-1" />
              {confirmingSweep ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">Archive {sweepCount ?? 0}?</span>
                  <button onClick={handleSweep} className="text-xs px-2.5 py-1.5 rounded-md bg-accent text-white">Confirm</button>
                  <button onClick={() => setConfirmingSweep(false)} className="text-xs px-2.5 py-1.5 rounded-md bg-bg-tertiary text-text-secondary border border-border-primary">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingSweep(true)}
                  disabled={sweepBusy || !sweepCount}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bg-tertiary text-text-primary border border-border-primary hover:border-accent disabled:opacity-50"
                >
                  {sweepBusy ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                  Archive {sweepCount ?? "…"}
                </button>
              )}
            </div>
          </section>

          {/* By sender */}
          <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-text-primary">Clutter by sender</h2>
              {selectedClusters.length > 0 && (
                <button
                  onClick={() => runArchiveSenders(selectedClusters, false)}
                  disabled={busyAddress !== null}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  <Trash2 size={13} />
                  Archive selected ({selectedClusters.reduce((n, c) => n + c.count, 0)})
                </button>
              )}
            </div>

            {loading && !data ? (
              <div className="flex items-center gap-2 text-sm text-text-tertiary py-6">
                <Loader2 size={15} className="animate-spin" /> Analyzing your inbox…
              </div>
            ) : senders.length === 0 ? (
              <p className="text-sm text-text-tertiary py-4">Your inbox is tidy — no high-volume senders to clear. 🎉</p>
            ) : (
              <div className="space-y-0.5">
                {senders.map((cluster) => (
                  <SenderClusterRow
                    key={cluster.address}
                    cluster={cluster}
                    selected={selected.has(cluster.address)}
                    busy={busyAddress === cluster.address}
                    onToggleSelect={toggleSelect}
                    onArchive={(c) => runArchiveSenders([c], false)}
                    onUnsubscribe={(c) => runArchiveSenders([c], true)}
                    onAlwaysArchive={handleAlwaysArchive}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
