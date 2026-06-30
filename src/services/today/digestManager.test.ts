import { describe, it, expect } from "vitest";
import {
  getTodayStartMs,
  isNeedsReply,
  isAutomatedSender,
  computeStats,
  selectSuggestionCandidates,
  digestContentHash,
  type TodayThread,
} from "./digestManager";

function thread(overrides: Partial<TodayThread> = {}): TodayThread {
  return {
    id: "t1",
    subject: "Subject",
    snippet: "snippet",
    fromName: "Sam",
    fromAddress: "sam@other.com",
    lastMessageAt: 1_700_000_000_000,
    isUnread: true,
    isImportant: false,
    ...overrides,
  };
}

describe("getTodayStartMs", () => {
  it("returns local midnight of the given day in ms", () => {
    const now = new Date(2026, 5, 29, 14, 30, 0); // Jun 29 2026, 14:30 local
    const start = getTodayStartMs(now);
    const d = new Date(start);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(29);
    expect(start).toBeLessThanOrEqual(now.getTime());
  });
});

describe("isNeedsReply", () => {
  const me = "me@example.com";

  it("is true when latest sender is not the user", () => {
    expect(isNeedsReply(thread({ fromAddress: "sam@other.com" }), me)).toBe(true);
  });

  it("is false when latest sender is the user (case-insensitive)", () => {
    expect(isNeedsReply(thread({ fromAddress: "ME@Example.com" }), me)).toBe(false);
  });

  it("is false when sender is missing", () => {
    expect(isNeedsReply(thread({ fromAddress: null }), me)).toBe(false);
  });

  it("is false for automated/no-reply senders (e.g. GitHub notifications)", () => {
    expect(isNeedsReply(thread({ fromAddress: "notifications@github.com" }), me)).toBe(false);
    expect(isNeedsReply(thread({ fromAddress: "no-reply@example.com" }), me)).toBe(false);
  });
});

describe("isAutomatedSender", () => {
  it("flags common automated mailboxes", () => {
    for (const a of [
      "notifications@github.com",
      "no-reply@stripe.com",
      "noreply@google.com",
      "donotreply@bank.com",
      "do.not.reply@x.com",
      "alerts@datadog.com",
      "mailer-daemon@host.com",
      "bounce+abc@sendgrid.net",
    ]) {
      expect(isAutomatedSender(a)).toBe(true);
    }
  });

  it("does not flag real people", () => {
    for (const a of ["sarah@acme.com", "jordan.patel@company.com", "info@startup.io", "noreplytome@notme.com".replace("noreply", "hello")]) {
      expect(isAutomatedSender(a)).toBe(false);
    }
  });

  it("is false for empty", () => {
    expect(isAutomatedSender(null)).toBe(false);
  });
});

describe("computeStats", () => {
  it("counts received, unread, and awaiting-reply", () => {
    const me = "me@example.com";
    const threads = [
      thread({ id: "a", fromAddress: "sam@x.com", isUnread: true }),
      thread({ id: "b", fromAddress: "me@example.com", isUnread: false }), // sent by me
      thread({ id: "c", fromAddress: "jo@x.com", isUnread: false }),
    ];
    expect(computeStats(threads, me)).toEqual({ received: 3, unread: 1, awaitingReply: 2 });
  });
});

describe("selectSuggestionCandidates", () => {
  const me = "me@example.com";
  const threads = [
    thread({ id: "needs1", fromAddress: "a@x.com" }),
    thread({ id: "needs2", fromAddress: "b@x.com" }),
    thread({ id: "mine", fromAddress: "me@example.com" }), // not actionable
    thread({ id: "tasked", fromAddress: "c@x.com" }),
    thread({ id: "dismissed", fromAddress: "d@x.com" }),
  ];

  it("keeps only actionable threads without tasks or dismissals", () => {
    const result = selectSuggestionCandidates(
      threads,
      me,
      new Set(["tasked"]),
      new Set(["dismissed"]),
    );
    expect(result.map((t) => t.id)).toEqual(["needs1", "needs2"]);
  });

  it("respects the cap", () => {
    const result = selectSuggestionCandidates(threads, me, new Set(), new Set(), 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("needs1");
  });
});

describe("digestContentHash", () => {
  it("is stable regardless of thread order", () => {
    const a = [thread({ id: "x", lastMessageAt: 1 }), thread({ id: "y", lastMessageAt: 2 })];
    const b = [thread({ id: "y", lastMessageAt: 2 }), thread({ id: "x", lastMessageAt: 1 })];
    expect(digestContentHash(a)).toBe(digestContentHash(b));
  });

  it("changes when a thread's state changes", () => {
    const a = [thread({ id: "x", isUnread: true })];
    const b = [thread({ id: "x", isUnread: false })];
    expect(digestContentHash(a)).not.toBe(digestContentHash(b));
  });

  it("changes when a new thread arrives", () => {
    const a = [thread({ id: "x" })];
    const b = [thread({ id: "x" }), thread({ id: "z" })];
    expect(digestContentHash(a)).not.toBe(digestContentHash(b));
  });
});
