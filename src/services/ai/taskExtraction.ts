import { extractTaskFromThread as aiExtract, extractActionTaskFromThread } from "./aiService";
import type { DbMessage } from "@/services/db/messages";
import type { TaskPriority } from "@/services/db/tasks";

export interface ExtractedTask {
  title: string;
  description: string | null;
  dueDate: number | null;
  priority: TaskPriority;
}

const VALID_PRIORITIES = new Set<TaskPriority>(["none", "low", "medium", "high", "urgent"]);

/**
 * Extract a task from a thread using AI, with robust parsing of the result.
 */
export async function extractTask(
  threadId: string,
  accountId: string,
  messages: DbMessage[],
): Promise<ExtractedTask> {
  const raw = await aiExtract(threadId, accountId, messages);

  try {
    // Extract JSON from potential markdown code fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in AI response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      description?: string;
      dueDate?: number | null;
      priority?: string;
    };

    const subject = messages[0]?.subject ?? "Email task";

    return {
      title: (typeof parsed.title === "string" && parsed.title.trim())
        ? parsed.title.trim()
        : `Follow up on: ${subject}`,
      description: typeof parsed.description === "string" ? parsed.description : null,
      dueDate: typeof parsed.dueDate === "number" ? parsed.dueDate : null,
      priority: VALID_PRIORITIES.has(parsed.priority as TaskPriority)
        ? (parsed.priority as TaskPriority)
        : "medium",
    };
  } catch {
    // Fallback if parsing fails
    const subject = messages[0]?.subject ?? "Email task";
    return {
      title: `Follow up on: ${subject}`,
      description: null,
      dueDate: null,
      priority: "medium",
    };
  }
}

/**
 * Extract a to-do ONLY when the thread implies an action beyond replying.
 * Returns null for reply-only threads (those belong in "To respond", not as a
 * duplicate task suggestion).
 */
export async function extractActionableTask(messages: DbMessage[]): Promise<ExtractedTask | null> {
  const raw = await extractActionTaskFromThread(messages);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      task?: { title?: string; description?: string; dueDate?: number | null; priority?: string } | null;
    };
    const task = parsed.task;
    if (!task || typeof task.title !== "string" || !task.title.trim()) return null;
    return {
      title: task.title.trim(),
      description: typeof task.description === "string" ? task.description : null,
      dueDate: typeof task.dueDate === "number" ? task.dueDate : null,
      priority: VALID_PRIORITIES.has(task.priority as TaskPriority) ? (task.priority as TaskPriority) : "medium",
    };
  } catch {
    return null;
  }
}
