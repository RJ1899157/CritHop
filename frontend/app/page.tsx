"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import QueryBox from "@/components/QueryBox";
import type { QueryResult } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [selectedQ, setSelectedQ] = useState("");
  const [selectedDs, setSelectedDs] = useState("hotpotqa");

  useEffect(() => {
    // Clear any previous query results so the query page is always fresh
    try {
      localStorage.removeItem("crithop-result");
      sessionStorage.removeItem("crithop-result");
    } catch {
      // ignore
    }
  }, []);

  function handleResult(_newResult: QueryResult) {
    // Smoothly transition to the dedicated Results tab
    router.push("/results");
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12 space-y-12">

      {/* Hero & Query Interface */}
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

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/questions"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <span>Browse 17-Question Bank</span>
              <span>→</span>
            </Link>
            <Link
              href="/eval"
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/20"
            >
              <span>View Benchmark Results</span>
              <span>↗</span>
            </Link>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
          <QueryBox
            onResult={handleResult}
            initialQuestion={selectedQ}
            initialDataset={selectedDs}
          />
        </div>
      </div>

      {/* Feature Showcase Grid - Explaining the App's Dedicated Tabs */}
      <div className="border-t border-white/10 pt-12">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Explore Architecture & Capabilities
          </p>
          <h2 className="mt-2 text-2xl font-bold text-white">Dedicated Workspace Tabs</h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {/* Tab 1: Results */}
          <Link
            href="/results"
            className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-emerald-400/40 hover:bg-white/[0.05]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 font-bold group-hover:bg-emerald-400 group-hover:text-slate-950 transition">
              01
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-emerald-300 transition">
              Results Tab
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Inspect grounded answers, supporting Wikipedia passages, multi-hop HopTrace graph paths, and Self-RAG critique signals.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition">
              Open Results →
            </span>
          </Link>

          {/* Tab 2: Question Bank */}
          <Link
            href="/questions"
            className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-emerald-400/40 hover:bg-white/[0.05]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-400/10 border border-sky-400/20 text-sky-400 font-bold group-hover:bg-sky-400 group-hover:text-slate-950 transition">
              02
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-sky-300 transition">
              Question Bank
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Browse 17 curated questions across HotpotQA, MuSiQue, and 2WikiMultiHopQA with 1-click loading into the query runner.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-sky-400 group-hover:translate-x-1 transition">
              Open Question Bank →
            </span>
          </Link>

          {/* Tab 3: Evaluation Showcase */}
          <Link
            href="/eval"
            className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-emerald-400/40 hover:bg-white/[0.05]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-400/10 border border-purple-400/20 text-purple-400 font-bold group-hover:bg-purple-400 group-hover:text-slate-950 transition">
              03
            </div>
            <h3 className="mt-4 text-lg font-semibold text-white group-hover:text-purple-300 transition">
              Evaluation Showcase
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Review calibrated metrics demonstrating CritHop outperforming HopRAG and Self-RAG across standard 0–100 EM and F1 benchmarks.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-purple-400 group-hover:translate-x-1 transition">
              Open Evaluation →
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
