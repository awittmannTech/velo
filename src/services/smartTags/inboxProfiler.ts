import { getDb } from "@/services/db/connection";
import { getSenderClusters } from "@/services/db/cleanup";
import { getSetting, setSetting } from "@/services/db/settings";
import { analyzeInboxProfile } from "@/services/ai/aiService";

/**
 * Builds an AI profile of the user from their inbox so we can propose
 * personalized tags. Stored per-account in `settings` (key inbox_profile_<id>).
 */
export interface InboxProfile {
  role: string;
  keyContacts: string[];
  orgs: string[];
  themes: string[];
  relationshipTypes: string[];
  generatedAt: number;
}

const profileKey = (accountId: string) => `inbox_profile_${accountId}`;

export async function getStoredProfile(accountId: string): Promise<InboxProfile | null> {
  const raw = await getSetting(profileKey(accountId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InboxProfile;
  } catch {
    return null;
  }
}

/** Compact, AI-free summary of inbox signals: top senders, category mix, subjects. */
export async function gatherProfileSignals(accountId: string): Promise<string> {
  const senders = await getSenderClusters(accountId, 1, 40);
  const db = await getDb();
  const cats = await db.select<{ category: string; n: number }[]>(
    `SELECT COALESCE(tc.category, 'Primary') AS category, COUNT(*) AS n
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id AND tl.label_id = 'INBOX'
     LEFT JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     WHERE t.account_id = $1
     GROUP BY category ORDER BY n DESC`,
    [accountId],
  );
  const subjects = await db.select<{ subject: string | null }[]>(
    `SELECT t.subject FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id AND tl.label_id = 'INBOX'
     WHERE t.account_id = $1 AND t.subject IS NOT NULL
     ORDER BY t.last_message_at DESC LIMIT 50`,
    [accountId],
  );

  const senderLines = senders
    .map((s) => `${s.name?.trim() || s.address} <${s.address}> (${s.count})`)
    .join("\n");
  const catLine = cats.map((c) => `${c.category}: ${c.n}`).join(", ");
  const subjLines = subjects.map((s) => s.subject).filter(Boolean).join("\n");
  return `TOP SENDERS:\n${senderLines}\n\nCATEGORY MIX: ${catLine}\n\nRECENT SUBJECTS:\n${subjLines}`;
}

/** Pure: parse the AI profile JSON into a validated InboxProfile (sans timestamp). */
export function parseProfile(raw: string): Omit<InboxProfile, "generatedAt"> {
  let obj: Record<string, unknown> = {};
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) obj = JSON.parse(m[0]);
  } catch {
    // fall through to empties
  }
  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  return {
    role: typeof obj["role"] === "string" ? (obj["role"] as string) : "",
    keyContacts: strArray(obj["keyContacts"]),
    orgs: strArray(obj["orgs"]),
    themes: strArray(obj["themes"]),
    relationshipTypes: strArray(obj["relationshipTypes"]),
  };
}

export async function buildInboxProfile(accountId: string): Promise<InboxProfile> {
  const signals = await gatherProfileSignals(accountId);
  const raw = await analyzeInboxProfile(signals);
  const profile: InboxProfile = { ...parseProfile(raw), generatedAt: Date.now() };
  await setSetting(profileKey(accountId), JSON.stringify(profile));
  return profile;
}
