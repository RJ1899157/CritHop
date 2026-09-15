"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { QueryResult } from "@/lib/api";

type ResultContextType = {
  result: QueryResult | null;
  setResult: (result: QueryResult | null) => void;
};

const ResultContext = createContext<ResultContextType>({
  result: null,
  setResult: () => {},
});

export function ResultProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<QueryResult | null>(null);

  useEffect(() => {
    // Clean up any legacy persistent storage from previous versions
    try {
      localStorage.removeItem("crithop-result");
      sessionStorage.removeItem("crithop-result");
      sessionStorage.removeItem("crithop-fresh");
    } catch {}
  }, []);

  return (
    <ResultContext.Provider value={{ result, setResult }}>
      {children}
    </ResultContext.Provider>
  );
}

export function useQueryResult() {
  return useContext(ResultContext);
}
