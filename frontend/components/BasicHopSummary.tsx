"use client";

import Link from "next/link";
import type { QueryResult } from "@/lib/api";

type BasicHopSummaryProps = {
  result: QueryResult;
};

export default function BasicHopSummary({ result }: BasicHopSummaryProps) {
  const hopTrace = result.hop_trace ?? [];
  const critiqueLog = result.critique_log;
  const isuse = critiqueLog?.isuse_decision ?? true;
  const issupPass = critiqueLog?.issup_decisions?.every(Boolean) ?? true;
  const totalPassages = result.graph?.nodes?.length || (result.supporting_passages?.length ?? 0);

  return (
    <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-emerald-400">
              Basic Traversal Summary
            </p>
          </div>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {hopTrace.length}-Hop Reasoning Sequence
          </h3>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            {totalPassages} Passages Evaluated
          </span>
          <span className={`rounded-full border px-3 py-1 ${
            isuse && issupPass
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-amber-400/30 bg-amber-400/10 text-amber-300"
          }`}>
            {isuse ? "Self-RAG Verified" : "Needs Review"}
          </span>
        </div>
      </div>

      {/* Hop Steps Summary Pills */}
      <div className="space-y-3">
        {hopTrace.length === 0 ? (
          <p className="text-xs text-slate-400">No multi-hop steps recorded.</p>
        ) : (
          hopTrace.map((hop, idx) => {
            const hopNum = typeof hop.hop === "number" ? hop.hop : idx + 1;
            const decisions = (hop.isrel_decisions && typeof hop.isrel_decisions === "object")
              ? (hop.isrel_decisions as Record<string, boolean>)
              : {};
            const kept = Object.values(decisions).filter(Boolean).length;
            const pruned = Object.values(decisions).length - kept;
            const target = String(hop.reasoning_step || "");

            return (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/5 bg-black/30 p-3.5 px-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-400/10 border border-emerald-400/30 text-xs font-bold font-mono text-emerald-400">
                    H{hopNum}
                  </span>
                  <div className="text-xs">
                    <p className="text-slate-200 line-clamp-1 font-medium">
                      {target || `Hop ${hopNum} Sub-query Traversal`}
                    </p>
                    {Boolean(hop.llm_reasoning_step) && (
                      <p className="text-slate-400 text-[11px] line-clamp-1 mt-0.5">
                        ➔ {String(hop.llm_reasoning_step)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                  <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-emerald-300">
                    {kept} kept
                  </span>
                  <span className="rounded-md bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-rose-300">
                    {pruned} pruned
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Prominent High-Tech Call to Action linking to the Results Tab */}
      <Link
        href="/results"
        className="group relative block overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-emerald-500/10 p-4 transition duration-300 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/20"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 group-hover:scale-105 transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-cyan-200 transition">
                Launch Full Traversal Playback & 2D/3D Graph
              </p>
              <p className="text-xs text-slate-400">
                Step-by-step playback scrubber, 3D WebGL nebula, and passage node inspector in the Results Tab.
              </p>
            </div>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-mono font-bold text-cyan-400 group-hover:translate-x-1 transition shrink-0">
            Open Results Tab →
          </span>
        </div>
      </Link>
    </div>
  );
}
