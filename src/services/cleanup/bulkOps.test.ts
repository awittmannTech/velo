import { describe, it, expect } from "vitest";
import { labelsToRestore } from "./bulkOps";

describe("labelsToRestore", () => {
  it("returns labels present in the snapshot but missing now (e.g. INBOX after archive)", () => {
    expect(labelsToRestore(["INBOX", "STARRED"], ["STARRED"])).toEqual(["INBOX"]);
  });

  it("returns nothing when current already has all snapshot labels", () => {
    expect(labelsToRestore(["INBOX"], ["INBOX", "STARRED"])).toEqual([]);
  });

  it("restores multiple removed labels (e.g. after a tag merge)", () => {
    expect(labelsToRestore(["INBOX", "Label_old", "STARRED"], ["STARRED"])).toEqual([
      "INBOX",
      "Label_old",
    ]);
  });

  it("handles an empty snapshot", () => {
    expect(labelsToRestore([], ["INBOX"])).toEqual([]);
  });
});
