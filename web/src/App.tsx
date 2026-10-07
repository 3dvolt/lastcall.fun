import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { CreatePage } from "./pages/CreatePage";
import { MarketPage } from "./pages/MarketPage";
import { MarketsPage } from "./pages/MarketsPage";
import { assertNotMainnet, assertSafeConfig } from "./lib/safety";

function Guard({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  let cfgError: string | null = null;
  try { assertSafeConfig(); } catch (e) { cfgError = (e as Error).message; }
  const net = useQuery({ queryKey: ["net-guard"], enabled: !cfgError, retry: false, staleTime: Infinity, queryFn: async () => { await assertNotMainnet(connection); return true; } });
  const err = cfgError ?? (net.error ? (net.error as Error).message : null);
  if (err) return <main className="page narrow"><div className="card"><h1>Configuration problem</h1><p className="notice warn">{err}</p></div></main>;
  return <>{children}</>;
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
      <footer className="footer muted small">Devnet demo · centralized resolver and mock price feed · not financial advice</footer>
    </>
  );
}
