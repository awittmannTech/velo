import { syncProgressLabel } from "./SyncIndicator";

describe("syncProgressLabel", () => {
  it("returns a generic label when no progress is given", () => {
    expect(syncProgressLabel()).toBe("Syncing…");
  });

  it("formats the messages phase with a count", () => {
    expect(
      syncProgressLabel({ phase: "messages", current: 12, total: 50 }),
    ).toBe("Syncing 12/50 messages");
  });

  it("describes the labels phase", () => {
    expect(syncProgressLabel({ phase: "labels", current: 0, total: 1 })).toBe(
      "Syncing labels…",
    );
  });

  it("formats the threads phase with a count", () => {
    expect(
      syncProgressLabel({ phase: "threads", current: 3, total: 9 }),
    ).toBe("Building threads 3/9");
  });

  it("falls back to a generic label for the done phase", () => {
    expect(syncProgressLabel({ phase: "done", current: 1, total: 1 })).toBe(
      "Syncing…",
    );
  });
});
