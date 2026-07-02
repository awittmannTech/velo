import { useState, useEffect, useCallback, useRef } from "react";
import { Archive, FolderOpen, Loader2, Download, Check, AlertCircle, Info } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { getLabelsForAccount, type DbLabel } from "@/services/db/labels";
import {
  countBackup,
  runBackup,
  type BackupProgress,
  type BackupResult,
} from "@/services/backup/backupService";
import type { BackupScope } from "@/services/backup/backupQuery";

type ScopeKind = "everything" | "label" | "sender" | "dateRange" | "search";

export function BackupPage() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.isActive);
  const accountId = activeAccount?.id ?? null;
  const isGmail = activeAccount?.provider === "gmail_api";

  const [labels, setLabels] = useState<DbLabel[]>([]);
  const [scopeKind, setScopeKind] = useState<ScopeKind>("everything");
  const [labelId, setLabelId] = useState("");
  const [sender, setSender] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const [beforeDate, setBeforeDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [fetchRaw, setFetchRaw] = useState(false);

  const [destDir, setDestDir] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (accountId) getLabelsForAccount(accountId).then(setLabels).catch(() => {});
  }, [accountId]);

  const buildScope = useCallback((): BackupScope | null => {
    switch (scopeKind) {
      case "everything":
        return { kind: "everything" };
      case "label":
        return labelId ? { kind: "label", label: labelId } : null;
      case "sender":
        return sender.trim() ? { kind: "sender", sender: sender.trim() } : null;
      case "dateRange": {
        const afterMs = afterDate ? new Date(afterDate).getTime() : undefined;
        const beforeMs = beforeDate ? new Date(`${beforeDate}T23:59:59`).getTime() : undefined;
        if (afterMs === undefined && beforeMs === undefined) return null;
        return { kind: "dateRange", afterMs, beforeMs };
      }
      case "search":
        return searchQuery.trim() ? { kind: "search", query: searchQuery.trim() } : null;
    }
  }, [scopeKind, labelId, sender, afterDate, beforeDate, searchQuery]);

  // Live preview count.
  useEffect(() => {
    if (!accountId || running) return;
    const scope = buildScope();
    if (!scope) { setCount(null); return; }
    let cancelled = false;
    countBackup(accountId, scope).then((n) => { if (!cancelled) setCount(n); }).catch(() => { if (!cancelled) setCount(null); });
    return () => { cancelled = true; };
  }, [accountId, buildScope, running]);

  const pickFolder = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, multiple: false, title: "Choose a backup folder" });
      if (typeof picked === "string") setDestDir(picked);
    } catch (err) {
      console.error("[Velo] Folder pick failed:", err);
      setError("Couldn't open the folder picker.");
    }
  }, []);

  const start = useCallback(async () => {
    const scope = buildScope();
    if (!accountId || !activeAccount || !scope || !destDir) return;
    cancelRef.current = false;
    setRunning(true);
    setResult(null);
    setError(null);
    setProgress({ total: count ?? 0, processed: 0, written: 0, failed: 0 });
    try {
      const res = await runBackup({
        accountId,
        accountEmail: activeAccount.email,
        provider: activeAccount.provider,
        scope,
        destDir,
        fetchRawFromGmail: isGmail && fetchRaw,
        onProgress: setProgress,
        isCancelled: () => cancelRef.current,
      });
      setResult(res);
    } catch (err) {
      console.error("[Velo] Backup failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [accountId, activeAccount, buildScope, destDir, count, isGmail, fetchRaw]);

  const openFolder = useCallback(async (folder: string) => {
    try {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(folder);
    } catch (err) {
      console.error("[Velo] Open folder failed:", err);
    }
  }, []);

  if (!accountId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        Add an account to back up your email.
      </div>
    );
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      <div className="flex items-center gap-2.5 px-4 sm:px-6 py-4 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <Archive size={20} className="text-accent shrink-0" />
        <div>
          <h1 className="text-base font-semibold text-text-primary leading-tight">Back up email</h1>
          <p className="text-xs text-text-tertiary">Export your mail to portable .eml files on disk.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Scope */}
          <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">What to back up</h2>
            <div className="flex flex-wrap gap-1.5">
              {(["everything", "label", "sender", "dateRange", "search"] as ScopeKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setScopeKind(k)}
                  className={`text-xs px-2.5 py-1.5 rounded-md border ${
                    scopeKind === k ? "bg-accent text-white border-accent" : "bg-bg-tertiary text-text-secondary border-border-primary"
                  }`}
                >
                  {k === "everything" ? "Everything" : k === "dateRange" ? "Date range" : k === "label" ? "Label" : k === "sender" ? "Sender" : "Search"}
                </button>
              ))}
            </div>

            {scopeKind === "label" && (
              <select value={labelId} onChange={(e) => setLabelId(e.target.value)} className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-md border border-border-primary">
                <option value="">Select a label…</option>
                {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            {scopeKind === "sender" && (
              <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="name or email address" className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-md border border-border-primary" />
            )}
            {scopeKind === "dateRange" && (
              <div className="flex items-center gap-2 text-sm">
                <input type="date" value={afterDate} onChange={(e) => setAfterDate(e.target.value)} className="bg-bg-tertiary text-text-primary px-2 py-1.5 rounded-md border border-border-primary" />
                <span className="text-text-tertiary">to</span>
                <input type="date" value={beforeDate} onChange={(e) => setBeforeDate(e.target.value)} className="bg-bg-tertiary text-text-primary px-2 py-1.5 rounded-md border border-border-primary" />
              </div>
            )}
            {scopeKind === "search" && (
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="e.g. from:alice has:attachment after:2024/01/01" className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-md border border-border-primary" />
            )}

            <p className="text-xs text-text-tertiary">
              {count === null ? "Choose a valid scope to see a count." : `${count.toLocaleString()} message${count === 1 ? "" : "s"} match.`}
            </p>
          </section>

          {/* Destination + options */}
          <section className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">Destination</h2>
            <div className="flex items-center gap-2">
              <button onClick={pickFolder} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary border border-border-primary hover:border-accent">
                <FolderOpen size={15} /> Choose folder…
              </button>
              <span className="text-xs text-text-tertiary truncate">{destDir ?? "No folder chosen"}</span>
            </div>
            {isGmail && (
              <label className="flex items-start gap-2 text-xs text-text-secondary">
                <input type="checkbox" checked={fetchRaw} onChange={(e) => setFetchRaw(e.target.checked)} className="mt-0.5" />
                <span>Fetch the full original message from Gmail (highest fidelity, incl. attachments — slower, online only).</span>
              </label>
            )}
          </section>

          {/* Note */}
          <div className="flex items-start gap-2 text-xs text-text-tertiary px-1">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>Backs up your locally-synced mail (about the last year). Reconstructed .eml files don't embed attachments — use the Gmail option above for full fidelity.</span>
          </div>

          {/* Run / progress / result */}
          {running ? (
            <div className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <Loader2 size={15} className="animate-spin text-accent" /> Backing up… {progress?.processed ?? 0} / {progress?.total ?? 0}
              </div>
              <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
              <button onClick={() => { cancelRef.current = true; }} className="text-xs text-text-tertiary hover:text-danger">Cancel</button>
            </div>
          ) : result ? (
            <div className="rounded-2xl border border-border-primary bg-bg-secondary/40 p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-text-primary">
                <Check size={16} className="text-success" />
                {result.cancelled ? "Cancelled — " : ""}Backed up {result.written.toLocaleString()} message{result.written === 1 ? "" : "s"}
                {result.failed > 0 && <span className="text-warning"> · {result.failed} failed</span>}
              </div>
              <button onClick={() => openFolder(result.folder)} className="flex items-center gap-1.5 text-sm text-accent hover:underline">
                <FolderOpen size={14} /> Open folder
              </button>
            </div>
          ) : (
            <button
              onClick={start}
              disabled={!destDir || !count}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm font-medium disabled:opacity-50"
            >
              <Download size={16} /> Back up {count ? `${count.toLocaleString()} message${count === 1 ? "" : "s"}` : ""}
            </button>
          )}

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-danger"><AlertCircle size={14} /> {error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
