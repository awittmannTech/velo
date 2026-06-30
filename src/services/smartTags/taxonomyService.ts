import { upsertLabel, getLabelsForAccount } from "@/services/db/labels";
import { insertSmartLabelRule } from "@/services/db/smartLabelRules";
import { backfillSmartLabels } from "@/services/smartLabels/backfillService";
import { proposeSmartTags } from "@/services/ai/aiService";
import { GMAIL_LABEL_COLORS } from "@/components/labels/LabelForm";
import type { InboxProfile } from "./inboxProfiler";

export interface TagSuggestion {
  name: string;
  definition: string;
  rationale: string;
  type: string;
}

const BASELINE_TO_RESPOND: TagSuggestion = {
  name: "To respond",
  definition: "Emails from a person directly asking the user to reply or take an action.",
  rationale: "Surfaces mail that actually needs your reply.",
  type: "intent",
};

/** Pure: parse the AI suggestion array, tolerating markdown/extra text. */
export function parseTagSuggestions(raw: string): TagSuggestion[] {
  let arr: unknown[] = [];
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) arr = JSON.parse(m[0]);
  } catch {
    return [];
  }
  return arr
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .filter((o) => typeof o["name"] === "string" && (o["name"] as string).trim().length > 0)
    .map((o) => ({
      name: (o["name"] as string).trim(),
      definition: typeof o["definition"] === "string" ? (o["definition"] as string) : (o["name"] as string).trim(),
      rationale: typeof o["rationale"] === "string" ? (o["rationale"] as string) : "",
      type: typeof o["type"] === "string" ? (o["type"] as string) : "topic",
    }));
}

/** Pure: drop suggestions that duplicate existing names or each other (case-insensitive). */
export function dedupeSuggestions(suggestions: TagSuggestion[], existingNames: string[]): TagSuggestion[] {
  const seen = new Set(existingNames.map((n) => n.toLowerCase()));
  const out: TagSuggestion[] = [];
  for (const s of suggestions) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Pure: ensure the "To respond" baseline is present unless it already exists. */
export function withBaseline(suggestions: TagSuggestion[], existingNames: string[]): TagSuggestion[] {
  const present = new Set([...existingNames, ...suggestions.map((s) => s.name)].map((n) => n.toLowerCase()));
  return present.has("to respond") ? suggestions : [BASELINE_TO_RESPOND, ...suggestions];
}

export async function proposeTags(accountId: string, profile: InboxProfile): Promise<TagSuggestion[]> {
  const labels = await getLabelsForAccount(accountId);
  const existing = labels.filter((l) => l.type === "user").map((l) => l.name);
  const raw = await proposeSmartTags(JSON.stringify(profile), existing);
  return withBaseline(dedupeSuggestions(parseTagSuggestions(raw), existing), existing);
}

let colorIdx = Math.floor(Date.now() / 1000) % GMAIL_LABEL_COLORS.length;

/** Create a label + smart-label rule from an approved suggestion. Returns labelId. */
export async function createTagFromSuggestion(accountId: string, s: TagSuggestion): Promise<string> {
  const labelId = crypto.randomUUID();
  const color = GMAIL_LABEL_COLORS[colorIdx++ % GMAIL_LABEL_COLORS.length]!;
  await upsertLabel({ id: labelId, accountId, name: s.name, type: "user", colorBg: color.bg, colorFg: color.fg });
  await insertSmartLabelRule({ accountId, labelId, aiDescription: s.definition, isEnabled: true });
  return labelId;
}

/** Apply all smart-label rules (incl. newly created) across the inbox. */
export async function applyNewTags(accountId: string): Promise<number> {
  return backfillSmartLabels(accountId);
}
