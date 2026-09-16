"use client";

import { useEffect, useRef, useState } from "react";
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
      const data = await getEvaluation();
      setComparison(data);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load evaluation results.");
    }
  }

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    void loadEvaluation();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleRunEvaluation() {
    setIsRunning(true);
    setStatus("Initiating evaluation benchmark in background...");
    setError("");
    if (intervalRef.current) clearInterval(intervalRef.current);

    try {
      const response = await runEvaluation();
      setStatus(response.message || "Evaluation started. Polling for updates...");
      
      let attempts = 0;
      intervalRef.current = setInterval(async () => {
        attempts += 1;
        await loadEvaluation();
        if (attempts >= 12) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsRunning(false);
          setStatus("Evaluation run complete or progress synced.");
        }
      }, 5000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start evaluation.");
      setIsRunning(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="mt-4 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Research Showcase
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Benchmark Comparison
            </h1>
            <p className="mt-3 max-w-2xl text-base text-slate-400">
              Compare CritHop Phase 1 (prompted LLM critic) and Phase 2 (trained reranker-slm adapter) against HopRAG, Self-RAG, and retrieval baselines.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => void loadEvaluation()}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Refresh Table
            </button>
            <button
              onClick={handleRunEvaluation}
              disabled={isRunning}
              className="rounded-2xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 shadow-lg shadow-emerald-500/10"
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Running Evaluation...
                </span>
              ) : (
                "Run Evaluation"
              )}
            </button>
          </div>
        </div>

        {status && (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm text-emerald-200">
            {status}
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center gap-6 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-white/20 bg-white/5" />
            <span>Paper baselines & retrieval reference (grey)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-emerald-400/40 bg-emerald-950/80" />
            <span className="text-emerald-300 font-medium">CritHop P1 & P2 methods (highlighted green)</span>
          </div>
        </div>
      </div>

      {comparison ? (
        <ComparisonTable comparison={comparison} />
      ) : (
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-12 text-center text-sm text-slate-400">
          {error || "Loading comparison results from eval/results/comparison_table.json..."}
        </div>
      )}
    </main>
  );
}
