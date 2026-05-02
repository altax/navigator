import { useState, useCallback, useEffect } from "react";
import type { StackStatus } from "../types";
import { api } from "../api";

export function useStack() {
  const [stack, setStack] = useState<StackStatus | null>(null);

  const loadStack = useCallback(async () => {
    try {
      const s = await api.stackStatus();
      setStack(s);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadStack();
    const id = window.setInterval(loadStack, 15000);
    return () => window.clearInterval(id);
  }, [loadStack]);

  return { stack };
}
