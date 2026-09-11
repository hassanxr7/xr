"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, type Owner } from "./api";

interface OwnerContextValue {
  owner: Owner | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setOwner: (owner: Owner) => void;
}

const OwnerContext = createContext<OwnerContextValue | null>(null);

export function OwnerProvider({ children }: { children: React.ReactNode }) {
  const [owner, setOwnerState] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ owner: Owner }>("/api/auth/me");
      setOwnerState(res.owner);
      setError(null);
    } catch (err) {
      setOwnerState(null);
      if (err instanceof ApiError && err.status !== 401) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!owner) return;
    const root = document.documentElement;
    if (owner.theme === "light" || owner.theme === "dark") {
      root.setAttribute("data-theme", owner.theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }, [owner?.theme]);

  return (
    <OwnerContext.Provider value={{ owner, loading, error, refresh, setOwner: setOwnerState }}>
      {children}
    </OwnerContext.Provider>
  );
}

export function useOwner() {
  const ctx = useContext(OwnerContext);
  if (!ctx) throw new Error("useOwner must be used within OwnerProvider");
  return ctx;
}
