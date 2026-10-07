import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { explorerTx } from "../config";

interface Toast { id: number; kind: "success" | "error"; text: string; sig?: string }
interface Api { success(text: string, sig?: string): void; error(text: string): void }
const Ctx = createContext<Api | null>(null);
export const useToast = (): Api => { const c = useContext(Ctx); if (!c) throw new Error("ToastProvider missing"); return c; };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((y) => y.id !== id)), t.kind === "error" ? 9000 : 6000);
  }, []);
  const api = useMemo<Api>(() => ({ success: (text, sig) => push({ kind: "success", text, sig }), error: (text) => push({ kind: "error", text }) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            {t.sig && <a href={explorerTx(t.sig)} target="_blank" rel="noopener noreferrer">View</a>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
