import { PublicKey } from "@solana/web3.js";
import type { LifecycleClient } from "@lifecycle-markets/sdk";

export interface Quote {
  price: bigint; // USD6
  circulatingSupply: bigint; // whole tokens
  liquidityUsd: bigint; // USD6
  /** provider-side last update (unix s); used for staleness checks */
  updatedTs?: number;
  /** where the data came from, recorded in evidence */
  source: { address: string; authority: string };
}

/** Pluggable data source. Real implementations (DEX/aggregator APIs) would implement this. */
export interface Provider {
  readonly name: string;
  fetch(tokenRef: PublicKey): Promise<Quote | null>;
}

/**
 * DEFAULT, MOCKED provider: reads the on-chain `DemoFeed` PDA, which a single demo authority writes.
 * Data from any other authority is rejected (anyone could otherwise squat a feed).
 */
export class MockProvider implements Provider {
  readonly name = "mock";
  constructor(private client: LifecycleClient, private demoAuthority: PublicKey) {}
  async fetch(tokenRef: PublicKey): Promise<Quote | null> {
    const feed = await this.client.getFeed(tokenRef);
    if (!feed) return null;
    if (!feed.authority.equals(this.demoAuthority)) {
      console.warn(`[provider] feed ${feed.address.toBase58()} has unexpected authority ${feed.authority.toBase58()}; ignoring`);
      return null;
    }
    return {
      price: feed.price,
      circulatingSupply: feed.circulatingSupply,
      liquidityUsd: feed.liquidityUsd,
      updatedTs: Number(feed.updatedTs),
      source: { address: feed.address.toBase58(), authority: feed.authority.toBase58() },
    };
  }
}
