"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import ComparisonTable from "@/components/ComparisonTable";
import { getEvaluation, type ComparisonTable as ComparisonData } from "@/lib/api";

export default function EvalPage() {
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getEvaluation().then(setComparison).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load evaluation results."));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <Link href="/" className="text-sm text-emerald-300 hover:text-emerald-200">← CritHop</Link>
      <div className="mt-8 mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Evaluation lab</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Benchmark comparison</h1>
        <p className="mt-3 max-w-2xl text-slate-400">Published reference numbers stay muted while CritHop results are highlighted for quick inspection.</p>
      </div>
      {comparison ? <ComparisonTable comparison={comparison} /> : <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-sm text-slate-400">{error || "Loading comparison results..."}</div>}
    </main>
  );
}
