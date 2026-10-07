/** Same canonical JSON + sha256 as resolver/src/canonical.ts, so anyone can re-derive the on-chain evidence hash. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export async function evidenceHashHex(ev: Record<string, unknown>): Promise<string> {
  const { hash: _h, txSignature: _t, ...rest } = ev;
  const bytes = new TextEncoder().encode(canonicalJson(rest));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
