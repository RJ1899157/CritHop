"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import ComparisonTable from "@/components/ComparisonTable";
import { getEvaluation, runEvaluation, type ComparisonTable as ComparisonData } from "@/lib/api";

export default function EvalPage() {
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");

  async function loadEvaluation() {
    try {
      setComparison(await getEvaluation());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load evaluation results.");
    }
  }

  useEffect(() => { void loadEvaluation(); }, []);

  async function handleRunEvaluation() {
    setIsRunning(true);
    setStatus("");
    setError("");
    try {
      const response = await runEvaluation();
      setStatus(response.message);
      window.setTimeout(() => { void loadEvaluation(); }, 3000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start evaluation.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="mt-8 mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Evaluation lab</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Benchmark comparison</h1>
        <p className="mt-3 max-w-2xl text-slate-400">The main CritHop showcase: compare published references with Phase 1 prompting and the Phase 2 trained reranker.</p>
        <button onClick={handleRunEvaluation} disabled={isRunning} className="mt-6 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">
          {isRunning ? "Evaluation running..." : "Run Evaluation"}
        </button>
        {status && <p className="mt-3 text-sm text-emerald-300">{status}</p>}
      </div>
      {comparison ? <ComparisonTable comparison={comparison} /> : <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-sm text-slate-400">{error || "Loading comparison results..."}</div>}
    </main>
  );
}
