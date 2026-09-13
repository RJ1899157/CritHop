"use client";

import Link from "next/link";
import QuestionBank from "@/components/QuestionBank";

export default function QuestionsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Dataset Catalog
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Multi-Hop Question Banks
          </h1>
          <p className="mt-3 max-w-2xl text-base text-slate-400">
            Categorized multi-hop reasoning questions across HotpotQA, MuSiQue, and 2WikiMultiHopQA with explicit reasoning paths and pre-indexed ground truth evidence.
          </p>
        </div>

        <Link
          href="/"
          className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          ← Back to Query
        </Link>
      </div>

      <QuestionBank />
    </main>
  );
}
