import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/** Production-only strict CSP, built from the configured endpoints (dev needs inline scripts for HMR). */
function csp(env: Record<string, string>): Plugin {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      const rpc = env.VITE_RPC_URL || "https://api.devnet.solana.com";
      const ws = rpc.replace(/^http/, "ws");
      const origins = [rpc, ws, env.VITE_RESOLVER_API, env.VITE_FAUCET_API].filter(Boolean).map((u) => new URL(u).origin.replace(/\/$/, ""));
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // wallet-adapter modal sets inline styles
        "img-src 'self' data:",
        `connect-src 'self' ${origins.join(" ")}`,
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; ");
      return html.replace("<!--CSP-->", `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return { plugins: [react(), csp(env)], define: { global: "globalThis" }, build: { sourcemap: false, target: "es2022" }, server: { port: 5173 } };
});
