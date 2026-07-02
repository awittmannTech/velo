import type { DbMessage } from "@/services/db/messages";

/**
 * Pure helpers for serializing a stored message into a portable RFC822 `.eml`
 * file, plus filename sanitization and base64url decoding for Gmail raw bytes.
 *
 * These functions are side-effect free and unit-tested. The orchestrator in
 * `backupService.ts` handles all filesystem / network work.
 */

const CRLF = "\r\n";

/** Wrap a Message-ID value in angle brackets if it isn't already. */
function normalizeMessageId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed : `<${trimmed}>`;
}

/**
 * Format a Unix-millisecond timestamp as an RFC822-style date header value.
 * Mirrors the existing single-thread export in ThreadView (`toUTCString`).
 */
function formatDateHeader(dateMs: number): string {
  const d = new Date(dateMs);
  if (Number.isNaN(d.getTime())) return new Date(0).toUTCString();
  return d.toUTCString();
}

/**
 * Build a complete RFC822 message string from a stored message record.
 *
 * When both a text and an HTML body are present a `multipart/alternative` body
 * is produced; otherwise a single text/html (preferred) or text/plain part.
 * Attachments are not embedded (use the Gmail raw path for full fidelity).
 */
export function buildEml(msg: DbMessage, opts: { boundary?: string } = {}): string {
  const fromValue = msg.from_name
    ? `${msg.from_name} <${msg.from_address ?? ""}>`
    : (msg.from_address ?? "");

  const headers: string[] = [
    `From: ${fromValue}`,
    `To: ${msg.to_addresses ?? ""}`,
  ];
  if (msg.cc_addresses) headers.push(`Cc: ${msg.cc_addresses}`);
  if (msg.bcc_addresses) headers.push(`Bcc: ${msg.bcc_addresses}`);
  if (msg.reply_to) headers.push(`Reply-To: ${msg.reply_to}`);
  headers.push(`Subject: ${msg.subject ?? ""}`);
  headers.push(`Date: ${formatDateHeader(msg.date)}`);
  headers.push(`Message-ID: ${normalizeMessageId(msg.message_id_header ?? msg.id)}`);
  if (msg.in_reply_to_header) {
    headers.push(`In-Reply-To: ${normalizeMessageId(msg.in_reply_to_header)}`);
  }
  if (msg.references_header) headers.push(`References: ${msg.references_header}`);
  headers.push("MIME-Version: 1.0");

  const hasHtml = msg.body_html != null && msg.body_html !== "";
  const hasText = msg.body_text != null && msg.body_text !== "";

  if (hasHtml && hasText) {
    const boundary = opts.boundary ?? `=_velo_${sanitizeFilename(msg.id, 40)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const body = [
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      msg.body_text ?? "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      msg.body_html ?? "",
      `--${boundary}--`,
      "",
    ];
    return [...headers, ...body].join(CRLF);
  }

  const contentType = hasHtml ? "text/html" : "text/plain";
  const bodyContent = hasHtml ? (msg.body_html ?? "") : (msg.body_text ?? "");
  headers.push(`Content-Type: ${contentType}; charset=UTF-8`);
  headers.push("Content-Transfer-Encoding: 8bit");
  return [...headers, "", bodyContent].join(CRLF);
}

/**
 * Reduce an arbitrary string to a filesystem-safe token: only
 * `[A-Za-z0-9._-]`, collapsed runs, trimmed separators, length-capped, with a
 * non-empty fallback.
 */
export function sanitizeFilename(name: string, maxLen = 80): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  const capped = cleaned.slice(0, Math.max(1, maxLen));
  return capped.length > 0 ? capped : "email";
}

/** UTC `YYYYMMDD-HHMMSS` stamp for a Unix-millisecond timestamp. */
function utcStamp(dateMs: number): string {
  const d = new Date(dateMs);
  const safe = Number.isNaN(d.getTime()) ? new Date(0) : d;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${safe.getUTCFullYear()}${p(safe.getUTCMonth() + 1)}${p(safe.getUTCDate())}` +
    `-${p(safe.getUTCHours())}${p(safe.getUTCMinutes())}${p(safe.getUTCSeconds())}`
  );
}

/**
 * Deterministic, collision-resistant, sortable filename for a message:
 * `<utc-stamp>_<subject>_<shortid>.eml`.
 */
export function emlFilename(msg: DbMessage): string {
  const stamp = utcStamp(msg.date);
  const subject = sanitizeFilename(msg.subject ?? "no-subject", 50);
  const shortId = sanitizeFilename(msg.id, 24);
  return `${stamp}_${subject}_${shortId}.eml`;
}

/**
 * Decode a base64url string (Gmail `format=raw` payload) into raw bytes.
 * Handles missing padding and the `-`/`_` url-safe alphabet.
 */
export function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = b64.length % 4 === 0 ? 0 : 4 - (b64.length % 4);
  const padded = b64 + "=".repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
