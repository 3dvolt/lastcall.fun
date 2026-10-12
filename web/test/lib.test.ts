import { describe, expect, it } from "vitest";
import { PROGRAM_ERROR_NAMES } from "@lifecycle-markets/sdk";
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

describe("friendlyError", () => {
  it("maps program codes and wallet rejections", () => {
    // codes come from the IDL: assert by NAME so the test survives error re-numbering
    const code = (name: string) => Number(Object.entries(PROGRAM_ERROR_NAMES).find(([, n]) => n === name)![0]);
    expect(friendlyError(new Error(`failed: custom program error: 0x${code("SlippageExceeded").toString(16)}`))).toMatch(/slippage/i);
    expect(friendlyError(new Error(`{"InstructionError":[0,{"Custom":${code("TradingClosed")}}]}`))).toMatch(/expired/i);
    expect(friendlyError(new Error(`custom program error: 0x${code("OutsideWindow").toString(16)}`))).toMatch(/final window/i);
    expect(friendlyError(new Error("User rejected the request."))).toMatch(/cancelled/i);
  });
});
