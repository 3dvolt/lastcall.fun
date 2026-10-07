import { useEffect, type ReactNode } from "react";

export interface Row { k: string; v: ReactNode; strong?: boolean }

/** Every transaction goes through this: exact amounts, minimums and addresses are shown before the wallet prompt. */
export function ConfirmModal(props: { title: string; rows: Row[]; warning?: string; confirmLabel: string; pending: boolean; onConfirm(): void; onCancel(): void }) {
  const { title, rows, warning, confirmLabel, pending, onConfirm, onCancel } = props;
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [pending, onCancel]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) onCancel(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <dl className="rows">{rows.map((r) => (<div key={r.k} className={r.strong ? "row strong" : "row"}><dt>{r.k}</dt><dd>{r.v}</dd></div>))}</dl>
        {warning && <p className="notice warn">{warning}</p>}
        <p className="muted small">Your wallet will show this transaction for approval. Nothing is sent until you approve it there.</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel} disabled={pending}>Cancel</button>
          <button className="btn primary" onClick={onConfirm} disabled={pending}>{pending ? "Waiting for wallet…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
