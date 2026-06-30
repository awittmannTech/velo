import { describe, it, expect } from "vitest";
import { parseTagSuggestions, dedupeSuggestions, withBaseline, type TagSuggestion } from "./taxonomyService";

const sug = (name: string): TagSuggestion => ({ name, definition: "d", rationale: "r", type: "topic" });

describe("parseTagSuggestions", () => {
  it("parses a JSON array, tolerating surrounding text", () => {
    const raw = 'Here you go:\n[{"name":"Investors","definition":"VC mail","rationale":"you fundraise","type":"relationship"}] thanks';
    expect(parseTagSuggestions(raw)).toEqual([
      { name: "Investors", definition: "VC mail", rationale: "you fundraise", type: "relationship" },
    ]);
  });

  it("fills defaults for missing fields and drops nameless entries", () => {
    const raw = '[{"name":"Acme"},{"definition":"x"}]';
    expect(parseTagSuggestions(raw)).toEqual([
      { name: "Acme", definition: "Acme", rationale: "", type: "topic" },
    ]);
  });

  it("returns [] on garbage", () => {
    expect(parseTagSuggestions("no json here")).toEqual([]);
  });
});

describe("dedupeSuggestions", () => {
  it("removes duplicates of existing names and internal repeats (case-insensitive)", () => {
    const result = dedupeSuggestions([sug("Investors"), sug("investors"), sug("Travel")], ["TRAVEL"]);
    expect(result.map((s) => s.name)).toEqual(["Investors"]);
  });
});

describe("withBaseline", () => {
  it("prepends 'To respond' when absent", () => {
    expect(withBaseline([sug("Investors")], []).map((s) => s.name)).toEqual(["To respond", "Investors"]);
  });

  it("does not add it when a suggestion already has it", () => {
    expect(withBaseline([sug("To Respond")], []).map((s) => s.name)).toEqual(["To Respond"]);
  });

  it("does not add it when it already exists as a user tag", () => {
    expect(withBaseline([sug("Investors")], ["to respond"]).map((s) => s.name)).toEqual(["Investors"]);
  });
});
