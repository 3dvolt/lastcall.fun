import "./polyfills";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";
import { App } from "./App";
import { ToastProvider } from "./components/Toasts";
import { config } from "./config";

// dev-only: stripped from production builds (import.meta.env.DEV is statically false there)
if (import.meta.env.DEV) void import("./devWallet").then((m) => m.registerDevWallet());

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 2_000, retry: 1, refetchOnWindowFocus: true } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConnectionProvider endpoint={config.rpcUrl} config={{ commitment: "confirmed" }}>
      {/* No hard-coded wallets: any installed Wallet-Standard wallet (Phantom, Solflare, Backpack…) is detected. */}
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <HashRouter>
                <App />
              </HashRouter>
            </ToastProvider>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </StrictMode>,
);
