import { join } from "@tauri-apps/api/path";
import { mkdir, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { getDb } from "@/services/db/connection";
import type { DbMessage } from "@/services/db/messages";
import { getGmailClient } from "@/services/gmail/tokenManager";
import {
  scopeToQuerySpec,
  buildBackupQuery,
  buildBackupCountQuery,
  type BackupScope,
} from "./backupQuery";
import { buildEml, emlFilename, base64UrlToBytes, sanitizeFilename } from "./emlBuilder";

const BATCH_SIZE = 200;

export interface BackupProgress {
  total: number;
  processed: number;
  written: number;
  failed: number;
}

export interface BackupResult {
  folder: string;
  total: number;
  written: number;
  failed: number;
  mode: "reconstructed" | "gmail-raw";
  cancelled: boolean;
}

export interface RunBackupOptions {
  accountId: string;
  accountEmail: string;
  provider?: string;
  scope: BackupScope;
  /** Absolute folder chosen by the user; a dated subfolder is created inside. */
  destDir: string;
  /** Gmail only: fetch the verbatim RFC822 from the server for full fidelity. */
  fetchRawFromGmail?: boolean;
  onProgress?: (p: BackupProgress) => void;
  isCancelled?: () => boolean;
}

/** Count how many messages a scope would export, for the live preview. */
export async function countBackup(accountId: string, scope: BackupScope): Promise<number> {
  const db = await getDb();
  const spec = scopeToQuerySpec(scope);
  const { sql, params } = buildBackupCountQuery(spec, accountId);
  const rows = await db.select<{ count: number }[]>(sql, params);
  return rows[0]?.count ?? 0;
}

function timestampStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * Fetch the verbatim RFC822 bytes for a Gmail message via `format=raw`.
 * Returns null when unavailable so the caller falls back to reconstruction.
 */
async function fetchGmailRaw(accountId: string, messageId: string): Promise<Uint8Array | null> {
  try {
    const client = await getGmailClient(accountId);
    const res = await client.request<{ raw?: string }>(`/messages/${messageId}?format=raw`);
    if (!res.raw) return null;
    return base64UrlToBytes(res.raw);
  } catch (err) {
    console.error("[Velo] Gmail raw fetch failed for", messageId, err);
    return null;
  }
}

/**
 * Export matching messages to one `.eml` file each inside a dated subfolder of
 * `destDir`. Read-only with respect to mail and the database.
 */
export async function runBackup(opts: RunBackupOptions): Promise<BackupResult> {
  const {
    accountId,
    accountEmail,
    provider,
    scope,
    destDir,
    fetchRawFromGmail = false,
    onProgress,
    isCancelled,
  } = opts;

  const db = await getDb();
  const spec = scopeToQuerySpec(scope);

  const total = await countBackup(accountId, scope);

  const useRaw = fetchRawFromGmail && provider === "gmail_api";
  const mode: BackupResult["mode"] = useRaw ? "gmail-raw" : "reconstructed";

  const localPart = accountEmail.split("@")[0] ?? "account";
  const folderName = `velo-backup-${sanitizeFilename(localPart, 40)}-${timestampStamp(new Date())}`;
  const destFolder = await join(destDir, folderName);
  await mkdir(destFolder, { recursive: true });

  let processed = 0;
  let written = 0;
  let failed = 0;
  let offset = 0;
  let cancelled = false;

  const emit = () => onProgress?.({ total, processed, written, failed });
  emit();

  for (;;) {
    if (isCancelled?.()) {
      cancelled = true;
      break;
    }

    const { sql, params } = buildBackupQuery(spec, accountId, { limit: BATCH_SIZE, offset });
    const rows = await db.select<DbMessage[]>(sql, params);
    if (rows.length === 0) break;

    for (const msg of rows) {
      if (isCancelled?.()) {
        cancelled = true;
        break;
      }
      try {
        const filePath = await join(destFolder, emlFilename(msg));
        const rawBytes =
          useRaw && !msg.id.startsWith("imap-")
            ? await fetchGmailRaw(accountId, msg.id)
            : null;
        if (rawBytes) {
          await writeFile(filePath, rawBytes);
        } else {
          await writeTextFile(filePath, buildEml(msg));
        }
        written++;
      } catch (err) {
        console.error("[Velo] Failed to write backup for", msg.id, err);
        failed++;
      }
      processed++;
      emit();
    }

    if (cancelled) break;
    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  const manifest = {
    app: "Velo",
    createdAt: new Date().toISOString(),
    account: accountEmail,
    provider: provider ?? "unknown",
    scope,
    mode,
    counts: { total, written, failed },
    cancelled,
    note: "Backup covers locally-synced mail only (~365 day sync window). Reconstructed .eml files do not embed attachments; use the Gmail raw mode for full fidelity.",
  };
  try {
    const manifestPath = await join(destFolder, "manifest.json");
    await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error("[Velo] Failed to write backup manifest", err);
  }

  return { folder: destFolder, total, written, failed, mode, cancelled };
}
