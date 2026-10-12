import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { CreatePage } from "./pages/CreatePage";
import { MarketPage } from "./pages/MarketPage";
import { MarketsPage } from "./pages/MarketsPage";
import { config } from "./config";
import { assertNetworkMatches, assertSafeConfig } from "./lib/safety";

function Guard({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  let cfgError: string | null = null;
  try { assertSafeConfig(); } catch (e) { cfgError = (e as Error).message; }
  const net = useQuery({
    queryKey: ["net-guard", config.id], enabled: !cfgError, retry: 2, retryDelay: 1500, refetchOnWindowFocus: false,
    queryFn: async () => { await assertNetworkMatches(connection); return true; },
  });
  if (cfgError) return <main className="page narrow"><div className="card"><h1>Configuration problem</h1><p className="notice warn">{cfgError}</p></div></main>;
  if (net.isLoading) return <main className="page narrow"><div className="card skeleton" /></main>;
  if (net.error) {
    const msg = (net.error as Error).message;
    const unreachable = /failed to fetch|network|timeout|fetch/i.test(msg);
    return (
      <main className="page narrow"><div className="card">
        <h1>{unreachable ? `Can't reach ${config.label}` : "Wrong network"}</h1>
        <p className="notice warn">{unreachable ? "The app could not connect to the Solana RPC. Check your connection (or that the node is running) and try again." : msg}</p>
        <button className="btn primary" onClick={() => net.refetch()}>Try again</button>
      </div></main>
    );
  }
  return <>{children}</>;
}

function Footer() {
  return (
    <footer className="footer muted small">
      Last Call · last-call.fun · {config.real ? "mainnet" : "test network, tokens have no real value"} · prices read on-chain (PumpSwap + Pyth) · no resolver: the contract decides · not financial advice
    </footer>
  );
}

export function App() {
  return (
    <>
      <Header />
      <Guard>
        <Routes>
          <Route path="/" element={<MarketsPage />} />
          <Route path="/market/:id" element={<MarketPage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="*" element={<main className="page"><p>Page not found.</p></main>} />
        </Routes>
      </Guard>
      <Footer />
    </>
  );
}
