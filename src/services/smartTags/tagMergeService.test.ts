import { describe, it, expect } from "vitest";
import { computeMergeOperations, parseMergeResponse, type TagMergeProposal } from "./tagMergeService";

const p = (over: Partial<TagMergeProposal>): TagMergeProposal => ({
  labelId: "L1", name: "Tag", count: 1, action: "keep", targetLabelId: null, targetName: null, ...over,
});

describe("computeMergeOperations", () => {
  it("emits move + delete for a merge", () => {
    expect(computeMergeOperations([p({ labelId: "vc", action: "merge", targetLabelId: "investors" })])).toEqual([
      { type: "move", from: "vc", to: "investors" },
      { type: "delete", labelId: "vc" },
    ]);
  });

  it("emits a single delete for a delete", () => {
    expect(computeMergeOperations([p({ labelId: "junk", action: "delete" })])).toEqual([
      { type: "delete", labelId: "junk" },
    ]);
  });

  it("is a no-op for keep", () => {
    expect(computeMergeOperations([p({ action: "keep" })])).toEqual([]);
  });

  it("ignores a merge with a missing or self target", () => {
    expect(computeMergeOperations([p({ labelId: "x", action: "merge", targetLabelId: null })])).toEqual([]);
    expect(computeMergeOperations([p({ labelId: "x", action: "merge", targetLabelId: "x" })])).toEqual([]);
  });
});

describe("parseMergeResponse", () => {
  it("parses actions and targets, tolerating surrounding text", () => {
    const raw = 'ok: [{"name":"vc","action":"merge","target":"Investors"},{"name":"junk","action":"delete"},{"name":"Work","action":"keep"}]';
    expect(parseMergeResponse(raw)).toEqual([
      { name: "vc", action: "merge", target: "Investors" },
      { name: "junk", action: "delete", target: undefined },
      { name: "Work", action: "keep", target: undefined },
    ]);
  });

  it("defaults invalid actions to keep and returns [] on garbage", () => {
    expect(parseMergeResponse('[{"name":"a","action":"nope"}]')).toEqual([{ name: "a", action: "keep", target: undefined }]);
    expect(parseMergeResponse("no json")).toEqual([]);
  });
});
