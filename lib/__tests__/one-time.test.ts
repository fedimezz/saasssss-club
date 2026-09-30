import { describe, it, expect } from "vitest";
import { consumeOnce } from "../one-time";

describe("consumeOnce (in-memory fallback)", () => {
  it("true for the first caller, false for every later one", async () => {
    expect(await consumeOnce("k-1", 60)).toBe(true);
    expect(await consumeOnce("k-1", 60)).toBe(false);
    expect(await consumeOnce("k-1", 60)).toBe(false);
  });

  it("keys are independent", async () => {
    expect(await consumeOnce("k-a", 60)).toBe(true);
    expect(await consumeOnce("k-b", 60)).toBe(true);
  });

  it("concurrent callers: exactly one wins", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeOnce("k-race", 60)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
