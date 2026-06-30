import { describe, it, expect } from "vitest";
import { parseProfile } from "./inboxProfiler";

describe("parseProfile", () => {
  it("parses a well-formed profile", () => {
    const raw = '{"role":"startup founder","keyContacts":["Sarah"],"orgs":["Acme"],"themes":["fundraising"],"relationshipTypes":["investors"]}';
    expect(parseProfile(raw)).toEqual({
      role: "startup founder",
      keyContacts: ["Sarah"],
      orgs: ["Acme"],
      themes: ["fundraising"],
      relationshipTypes: ["investors"],
    });
  });

  it("coerces missing/invalid fields to safe empties and filters non-strings", () => {
    const raw = '{"role":123,"keyContacts":["A", 5, "B"],"orgs":null}';
    expect(parseProfile(raw)).toEqual({
      role: "",
      keyContacts: ["A", "B"],
      orgs: [],
      themes: [],
      relationshipTypes: [],
    });
  });

  it("returns empties on garbage", () => {
    expect(parseProfile("not json")).toEqual({
      role: "",
      keyContacts: [],
      orgs: [],
      themes: [],
      relationshipTypes: [],
    });
  });
});
