import {
  scopeToQuerySpec,
  buildBackupQuery,
  buildBackupCountQuery,
  type BackupScope,
} from "./backupQuery";

describe("scopeToQuerySpec", () => {
  it("maps 'everything' to an empty spec", () => {
    expect(scopeToQuerySpec({ kind: "everything" })).toEqual({});
  });

  it("maps label / sender scopes", () => {
    expect(scopeToQuerySpec({ kind: "label", label: "INBOX" })).toEqual({ label: "INBOX" });
    expect(scopeToQuerySpec({ kind: "sender", sender: "boss@x.com" })).toEqual({ from: "boss@x.com" });
  });

  it("passes through date-range milliseconds", () => {
    const spec = scopeToQuerySpec({ kind: "dateRange", afterMs: 1000, beforeMs: 2000 });
    expect(spec).toEqual({ afterMs: 1000, beforeMs: 2000 });
  });

  it("parses a search query and converts before/after seconds to milliseconds", () => {
    const spec = scopeToQuerySpec({
      kind: "search",
      query: "from:alice is:unread after:2024/01/01 budget",
    });
    expect(spec.from).toBe("alice");
    expect(spec.isUnread).toBe(true);
    expect(spec.freeText).toBe("budget");
    // after:2024/01/01 → parsed as LOCAL midnight (seconds) → *1000 = ms
    expect(spec.afterMs).toBe(new Date(2024, 0, 1).getTime());
  });
});

describe("buildBackupCountQuery", () => {
  it("always scopes by account and uses COUNT(*)", () => {
    const { sql, params } = buildBackupCountQuery({}, "acc-1");
    expect(sql).toContain("SELECT COUNT(*)");
    expect(sql).toContain("m.account_id = $1");
    expect(params).toEqual(["acc-1"]);
  });

  it("includes a label EXISTS clause matching by name or id", () => {
    const { sql, params } = buildBackupCountQuery({ label: "Work" }, "acc-1");
    expect(sql).toContain("FROM thread_labels tl");
    expect(sql).toContain("LOWER(l.name) = LOWER($2)");
    expect(sql).toContain("l.id = $2");
    expect(params).toEqual(["acc-1", "Work"]);
  });
});

describe("buildBackupQuery", () => {
  it("selects full rows ordered oldest-first with limit/offset params last", () => {
    const { sql, params } = buildBackupQuery({}, "acc-1", { limit: 200, offset: 400 });
    expect(sql).toContain("SELECT m.*");
    expect(sql).toContain("ORDER BY m.date ASC, m.id ASC");
    expect(sql).toContain("LIMIT $2 OFFSET $3");
    expect(params).toEqual(["acc-1", 200, 400]);
  });

  it("uses the FTS join and ranks account param after the MATCH param", () => {
    const { sql, params } = buildBackupQuery({ freeText: "invoice" }, "acc-1", {
      limit: 50,
      offset: 0,
    });
    expect(sql).toContain("messages_fts JOIN messages m");
    expect(sql).toContain("messages_fts MATCH $1");
    expect(sql).toContain("m.account_id = $2");
    expect(params).toEqual(["invoice", "acc-1", 50, 0]);
  });

  it("builds millisecond date-range bounds", () => {
    const { sql, params } = buildBackupQuery(
      { afterMs: 1000, beforeMs: 2000 },
      "acc-1",
      { limit: 10, offset: 0 },
    );
    expect(sql).toContain("m.date >= $2");
    expect(sql).toContain("m.date <= $3");
    expect(params).toEqual(["acc-1", 1000, 2000, 10, 0]);
  });

  it("adds sender and attachment predicates", () => {
    const { sql, params } = buildBackupQuery(
      { from: "alice", hasAttachment: true },
      "acc-1",
      { limit: 10, offset: 0 },
    );
    expect(sql).toContain("m.from_address LIKE");
    expect(sql).toContain("FROM attachments a");
    expect(params).toEqual(["acc-1", "alice", 10, 0]);
  });
});
