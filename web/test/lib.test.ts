import { describe, expect, it } from "vitest";
import { canonicalJson, evidenceHashHex } from "../src/lib/canonical";
import { friendlyError } from "../src/lib/errors";
import { formatUnits, parseUnits, withSlippage } from "../src/lib/format";

describe("parseUnits", () => {
  it("accepts plain decimals and rejects junk", () => {
    expect(parseUnits("1")).toBe(1_000_000n);
    expect(parseUnits("0.000001")).toBe(1n);
    expect(parseUnits(".5")).toBe(500_000n);
    expect(parseUnits("12.")).toBe(12_000_000n);
    for (const bad of ["", "-1", "1e6", "0x10", "1.0000001", "1,5", "abc", "1 2", "NaN", "Infinity"]) expect(parseUnits(bad)).toBeNull();
  });
  it("round-trips with formatUnits", () => {
    expect(formatUnits(parseUnits("1234.5")!, 6)).toBe("1,234.5");
    expect(formatUnits(0n)).toBe("0");
  });
  it("slippage floors toward the user's safety", () => {
    expect(withSlippage(1000n, 100)).toBe(990n);
  });
});

describe("evidence hash", () => {
  it("matches the resolver's canonical form (golden value)", async () => {
    // golden value computed with resolver/src/canonical.ts on the same object
    const ev = { b: 1, a: { d: "x", c: [3, { z: 1, y: 2 }] }, hash: "ignored", txSignature: "ignored" };
    expect(canonicalJson({ b: 1, a: { d: "x", c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":"x"},"b":1}');
    const h = await evidenceHashHex(ev);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await evidenceHashHex({ ...ev, hash: "other" })).toBe(h);
  });
});

describe("friendlyError", () => {
  it("maps program codes and wallet rejections", () => {
    expect(friendlyError(new Error("failed: custom program error: 0x1775"))).toMatch(/slippage/i);
    expect(friendlyError(new Error('{"InstructionError":[0,{"Custom":6007}]}'))).toMatch(/expired/i);
    expect(friendlyError(new Error("User rejected the request."))).toMatch(/cancelled/i);
  });
});
