import { Buffer } from "buffer";
// Must be the FIRST import of main.tsx: the SDK and web3.js use Buffer at module-evaluation time.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
