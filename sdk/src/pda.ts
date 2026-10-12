import { PublicKey } from "@solana/web3.js";
import { FEED_SEED, MARKET_SEED, POSITION_SEED, PROGRAM_ID, SAMPLES_SEED, VAULT_SEED } from "./constants.js";

const u64le = (n: bigint | number): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

export const marketPda = (creator: PublicKey, marketId: bigint | number, programId = PROGRAM_ID): PublicKey =>
  PublicKey.findProgramAddressSync([MARKET_SEED, creator.toBuffer(), u64le(marketId)], programId)[0];

export const vaultPda = (market: PublicKey, programId = PROGRAM_ID): PublicKey =>
  PublicKey.findProgramAddressSync([VAULT_SEED, market.toBuffer()], programId)[0];

export const positionPda = (market: PublicKey, user: PublicKey, programId = PROGRAM_ID): PublicKey =>
  PublicKey.findProgramAddressSync([POSITION_SEED, market.toBuffer(), user.toBuffer()], programId)[0];

export const feedPda = (tokenRef: PublicKey, programId = PROGRAM_ID): PublicKey =>
  PublicKey.findProgramAddressSync([FEED_SEED, tokenRef.toBuffer()], programId)[0];

export const samplesPda = (market: PublicKey, programId = PROGRAM_ID): PublicKey =>
  PublicKey.findProgramAddressSync([SAMPLES_SEED, market.toBuffer()], programId)[0];
