import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore, isMarketId } from "../src/store.js";

describe("market id validation (path traversal regression)", () => {
  const root = mkdtempSync(join(tmpdir(), "sec-"));
  mkdirSync(join(root, "keys"));
  writeFileSync(join(root, "keys", "resolver.json"), "[1,2,3]");
  const store = new FileStore(join(root, "data"));
  it("rejects traversal and separators", () => {
    for (const bad of ["../../keys/resolver", "..%2F..%2Fkeys%2Fresolver", "a/b", "", "x".repeat(60), "0OIl" + "1".repeat(30)]) {
      expect(isMarketId(bad)).toBe(false);
      expect(() => store.getEvidence(bad)).toThrow();
      expect(() => store.getSamples(bad)).toThrow();
    }
  });
  it("accepts real pubkeys", () => {
    expect(isMarketId("4XMTpzPENpXMxP1VXz4VDbPFfddVaH2LT9XjEZVTk1ZZ")).toBe(true);
    expect(store.getEvidence("4XMTpzPENpXMxP1VXz4VDbPFfddVaH2LT9XjEZVTk1ZZ")).toBeNull();
  });
});
