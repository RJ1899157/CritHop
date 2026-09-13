"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import QueryBox from "@/components/QueryBox";
import AnswerCard from "@/components/AnswerCard";
import CritiquePanel from "@/components/CritiquePanel";
import HopTrace from "@/components/HopTrace";
import type { QueryResult } from "@/lib/api";

export default function HomePage() {
  const [result, setResult] = useState<QueryResult | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("crithop-result");
      if (stored) {
        setResult(JSON.parse(stored) as QueryResult);
      }
    } catch {
      // ignore
    }
  }, []);

  function handleResult(newResult: QueryResult) {
    setResult(newResult);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="grid w-full gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            HopRAG × Self-RAG
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Reason across evidence, one hop at a time.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
            Ask any multi-hop question. CritHop retrieves, traverses, critiques, and answers — grounded in HotpotQA, MuSiQue, and 2WikiMultiHopQA with automatic context resolution.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>Graph traversal</span>
            <span>·</span>
            <span>Neural SLM IsREL</span>
            <span>·</span>
            <span>Self-RAG critique</span>
            <span>·</span>
            <span>Grounded answers</span>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
          <QueryBox onResult={handleResult} />
        </div>
      </div>

      {result && (
        <div ref={resultsRef} className="mt-16 border-t border-white/10 pt-12">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Active Result
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Question
              </p>
              <h2 className="mt-1 max-w-4xl text-2xl font-semibold text-white">
                {result.question}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-slate-400">
                {result.retrieval_retry ? "Fallback retrieval used" : "Initial retrieval accepted"}
              </span>
              <Link
                href="/results"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Dedicated Page ↗
              </Link>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-6">
              <AnswerCard
                answer={result.answer}
                supportingPassages={result.supporting_passages ?? []}
              />
              <HopTrace hopTrace={result.hop_trace ?? []} />
            </div>
            <div>
              <CritiquePanel
                isrelDecisions={result.critique_log?.isrel_decisions ?? []}
                issupDecisions={result.critique_log?.issup_decisions ?? []}
                isuseDecision={result.critique_log?.isuse_decision ?? false}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
