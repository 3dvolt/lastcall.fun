import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Evidence, Sample } from "./types.js";

/** Market ids become file names, so only canonical base58 pubkeys (32-44 chars, no separators) are accepted. */
export const isMarketId = (m: string): boolean => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m);
const safe = (m: string): string => { if (!isMarketId(m)) throw new Error("invalid market id"); return m; };

export interface Store {
  addSample(market: string, s: Sample): void;
  getSamples(market: string): Sample[];
  saveEvidence(market: string, e: Evidence): void;
  getEvidence(market: string): Evidence | null;
}

const ser = (s: Sample) => JSON.stringify({ ...s, price: s.price.toString(), circulatingSupply: s.circulatingSupply.toString(), liquidityUsd: s.liquidityUsd.toString(), marketCap: s.marketCap.toString() });
const de = (line: string): Sample => {
  const o = JSON.parse(line);
  return { ...o, price: BigInt(o.price), circulatingSupply: BigInt(o.circulatingSupply), liquidityUsd: BigInt(o.liquidityUsd), marketCap: BigInt(o.marketCap) };
};

/** JSON-lines samples + one JSON file per evidence. Zero native deps (chosen over SQLite for portability). */
export class FileStore implements Store {
  private cache = new Map<string, Sample[]>();
  constructor(private dir: string) {
    mkdirSync(join(dir, "samples"), { recursive: true });
    mkdirSync(join(dir, "evidence"), { recursive: true });
  }
  private sp = (m: string) => join(this.dir, "samples", `${safe(m)}.jsonl`);
  private ep = (m: string) => join(this.dir, "evidence", `${safe(m)}.json`);
  addSample(market: string, s: Sample) {
    appendFileSync(this.sp(market), ser(s) + "\n");
    this.cache.get(market)?.push(s);
  }
  getSamples(market: string): Sample[] {
    let c = this.cache.get(market);
    if (!c) {
      c = existsSync(this.sp(market)) ? readFileSync(this.sp(market), "utf8").split("\n").filter(Boolean).map(de) : [];
      this.cache.set(market, c);
    }
    return c;
  }
  saveEvidence(market: string, e: Evidence) { writeFileSync(this.ep(market), JSON.stringify(e, null, 2)); }
  getEvidence(market: string): Evidence | null {
    return existsSync(this.ep(market)) ? (JSON.parse(readFileSync(this.ep(market), "utf8")) as Evidence) : null;
  }
}

export class MemoryStore implements Store {
  private s = new Map<string, Sample[]>();
  private e = new Map<string, Evidence>();
  addSample(m: string, x: Sample) { (this.s.get(m) ?? this.s.set(m, []).get(m)!).push(x); }
  getSamples(m: string) { return this.s.get(m) ?? []; }
  saveEvidence(m: string, e: Evidence) { this.e.set(m, e); }
  getEvidence(m: string) { return this.e.get(m) ?? null; }
}
