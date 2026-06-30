import { describe, it, expect } from "vitest";
import { ageCutoffMs } from "./cleanupManager";

describe("ageCutoffMs", () => {
  it("subtracts N days (in ms) from now", () => {
    const now = 1_000_000_000_000;
    expect(ageCutoffMs(1, now)).toBe(now - 86_400_000);
    expect(ageCutoffMs(90, now)).toBe(now - 90 * 86_400_000);
  });

  it("returns a value in the past", () => {
    const now = Date.now();
    expect(ageCutoffMs(30, now)).toBeLessThan(now);
  });
});
