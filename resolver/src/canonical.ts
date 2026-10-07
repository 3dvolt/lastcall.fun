import { createHash } from "node:crypto";
import type { Evidence } from "./types.js";

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** sha256 over the canonical JSON of the evidence without `hash` and `txSignature`. */
export function evidenceHash(e: Evidence): Buffer {
  const { hash: _h, txSignature: _t, ...rest } = e;
  return createHash("sha256").update(canonicalJson(rest)).digest();
}
