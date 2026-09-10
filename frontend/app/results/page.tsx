"use client";

import { useState } from "react";
import Link from "next/link";

import AnswerCard from "@/components/AnswerCard";
import CritiquePanel from "@/components/CritiquePanel";
import HopTrace from "@/components/HopTrace";
import type { QueryResult } from "@/lib/api";

export default function ResultsPage() {
  const [result] = useState<QueryResult | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = sessionStorage.getItem("crithop-result");
    return stored ? (JSON.parse(stored) as QueryResult) : null;
  });

  if (!result) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-slate-400">No query result found.</p>
        <Link href="/" className="mt-5 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950">Run a query</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <Link href="/" className="text-sm text-emerald-300 hover:text-emerald-200">← New query</Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Question</p>
          <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-tight text-white">{result.question}</h1>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-slate-400">
          {result.retrieval_retry ? "Fallback retrieval used" : "Initial retrieval accepted"}
        </span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-6"><AnswerCard answer={result.answer} supportingPassages={result.supporting_passages} /><HopTrace hopTrace={result.hop_trace} /></div>
        <CritiquePanel isrelDecisions={result.critique_log.isrel_decisions} issupDecisions={result.critique_log.issup_decisions} isuseDecision={result.critique_log.isuse_decision} />
      </div>
    </main>
  );
}
