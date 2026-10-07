import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { friendlyError } from "../lib/errors";
import { useToast } from "../components/Toasts";

/** Runs a transaction-producing function with pending/error state, toasts, and cache invalidation. */
export function useTx() {
  const [pending, setPending] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const run = useCallback(async (label: string, fn: () => Promise<string>): Promise<string | null> => {
    setPending(true);
    try {
      const sig = await fn();
      toast.success(`${label} confirmed`, sig);
      await qc.invalidateQueries();
      return sig;
    } catch (e) {
      toast.error(friendlyError(e));
      return null;
    } finally { setPending(false); }
  }, [qc, toast]);
  return { run, pending };
}
