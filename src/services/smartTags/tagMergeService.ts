import { getDb } from "@/services/db/connection";
import { deleteLabel } from "@/services/db/labels";
import { proposeTagMergesAI } from "@/services/ai/aiService";

/**
 * One-time cleanup of the user's existing "not useful" tags: AI proposes a
 * keep / merge / delete action per tag, the user reviews, then we apply.
 */

export type MergeAction = "merge" | "keep" | "delete";

export interface TagWithCount {
  labelId: string;
  name: string;
  count: number;
}

export interface TagMergeProposal {
  labelId: string;
  name: string;
  count: number;
  action: MergeAction;
  targetLabelId: string | null;
  targetName: string | null;
}

export type MergeOp =
  | { type: "move"; from: string; to: string }
  | { type: "delete"; labelId: string };

/** Pure: turn reviewed proposals into concrete label operations. */
export function computeMergeOperations(proposals: TagMergeProposal[]): MergeOp[] {
  const ops: MergeOp[] = [];
  for (const p of proposals) {
    if (p.action === "merge" && p.targetLabelId && p.targetLabelId !== p.labelId) {
      ops.push({ type: "move", from: p.labelId, to: p.targetLabelId });
      ops.push({ type: "delete", labelId: p.labelId });
    } else if (p.action === "delete") {
      ops.push({ type: "delete", labelId: p.labelId });
    }
    // "keep" (or a merge with no valid target) → no-op
  }
  return ops;
}

/** Pure: parse the AI merge response, defaulting unknown actions to "keep". */
export function parseMergeResponse(raw: string): { name: string; action: MergeAction; target?: string }[] {
  let arr: unknown[] = [];
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) arr = JSON.parse(m[0]);
  } catch {
    return [];
  }
  const valid = new Set<MergeAction>(["merge", "keep", "delete"]);
  return arr
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .filter((o) => typeof o["name"] === "string")
    .map((o) => ({
      name: (o["name"] as string).trim(),
      action: valid.has(o["action"] as MergeAction) ? (o["action"] as MergeAction) : "keep",
      target: typeof o["target"] === "string" ? (o["target"] as string) : undefined,
    }));
}

export async function getUserTagsWithCounts(accountId: string): Promise<TagWithCount[]> {
  const db = await getDb();
  const rows = await db.select<{ id: string; name: string; count: number }[]>(
    `SELECT l.id, l.name, COUNT(tl.thread_id) AS count
     FROM labels l
     LEFT JOIN thread_labels tl ON tl.account_id = l.account_id AND tl.label_id = l.id
     WHERE l.account_id = $1 AND l.type = 'user'
     GROUP BY l.id ORDER BY count DESC, l.name ASC`,
    [accountId],
  );
  return rows.map((r) => ({ labelId: r.id, name: r.name, count: r.count }));
}

export async function proposeTagMerges(accountId: string): Promise<TagMergeProposal[]> {
  const tags = await getUserTagsWithCounts(accountId);
  if (tags.length === 0) return [];
  const byName = new Map(tags.map((t) => [t.name.toLowerCase(), t]));
  const parsed = parseMergeResponse(await proposeTagMergesAI(tags.map((t) => ({ name: t.name, count: t.count }))));

  return tags.map((t): TagMergeProposal => {
    const p = parsed.find((x) => x.name.toLowerCase() === t.name.toLowerCase());
    if (p?.action === "merge" && p.target) {
      const target = byName.get(p.target.toLowerCase());
      if (target && target.labelId !== t.labelId) {
        return { labelId: t.labelId, name: t.name, count: t.count, action: "merge", targetLabelId: target.labelId, targetName: target.name };
      }
    }
    if (p?.action === "delete") {
      return { labelId: t.labelId, name: t.name, count: t.count, action: "delete", targetLabelId: null, targetName: null };
    }
    return { labelId: t.labelId, name: t.name, count: t.count, action: "keep", targetLabelId: null, targetName: null };
  });
}

export async function applyTagMerges(
  accountId: string,
  proposals: TagMergeProposal[],
): Promise<{ merged: number; deleted: number }> {
  const db = await getDb();
  for (const op of computeMergeOperations(proposals)) {
    if (op.type === "move") {
      await db.execute(
        `INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id)
         SELECT account_id, thread_id, $2 FROM thread_labels WHERE account_id = $1 AND label_id = $3`,
        [accountId, op.to, op.from],
      );
    } else {
      await db.execute("DELETE FROM thread_labels WHERE account_id = $1 AND label_id = $2", [accountId, op.labelId]);
      await deleteLabel(accountId, op.labelId);
    }
  }
  return {
    merged: proposals.filter((p) => p.action === "merge" && p.targetLabelId).length,
    deleted: proposals.filter((p) => p.action === "delete").length,
  };
}
