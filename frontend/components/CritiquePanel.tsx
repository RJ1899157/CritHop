"use client";

import { useState } from "react";

type CritiquePanelProps = {
  isrelDecisions: boolean[];
  issupDecisions: boolean[];
  isuseDecision: boolean;
};

type FilterType = "all" | "isrel" | "issup" | "isuse";

function DecisionBadge({
  label,
  value,
  description,
}: {
  label: string;
  value: boolean;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 transition hover:border-white/20">
      <div className="flex flex-col">
        <span className="font-mono text-xs font-semibold tracking-wider text-slate-200">
          [{label}]
        </span>
        {description && (
          <span className="text-[10px] text-slate-500">{description}</span>
        )}
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
          value
            ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30"
            : "bg-red-400/15 text-red-300 border border-red-400/30"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            value ? "bg-emerald-400" : "bg-red-400"
          }`}
        />
        {value ? "YES" : "NO"}
      </span>
    </div>
  );
}

export default function CritiquePanel({
  isrelDecisions = [],
  issupDecisions = [],
  isuseDecision = false,
}: CritiquePanelProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  const relPass = isrelDecisions.filter(Boolean).length;
  const relTotal = isrelDecisions.length;
  const relRate = relTotal > 0 ? Math.round((relPass / relTotal) * 100) : 0;

  const supPass = issupDecisions.filter(Boolean).length;
  const supTotal = issupDecisions.length;
  const supRate = supTotal > 0 ? Math.round((supPass / supTotal) * 100) : 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-400">
            Critique Signals
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">Self-Reflection</h2>
        </div>
        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-300">
          Self-RAG Evaluator
        </span>
      </div>

      {/* Summary Scorecards */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Relevance</p>
          <p className="mt-1 font-mono text-lg font-bold text-emerald-400">
            {relRate}%
          </p>
          <p className="text-[10px] text-slate-500">{relPass}/{relTotal} Pass</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Support</p>
          <p className="mt-1 font-mono text-lg font-bold text-sky-400">
            {supRate}%
          </p>
          <p className="text-[10px] text-slate-500">{supPass}/{supTotal} Pass</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">IsUSE Verdict</p>
          <p className={`mt-1 text-sm font-bold ${isuseDecision ? "text-emerald-400" : "text-amber-400"}`}>
            {isuseDecision ? "Approved" : "Refine"}
          </p>
          <p className="text-[10px] text-slate-500">{isuseDecision ? "Grounded" : "Uncertain"}</p>
        </div>
      </div>

      {/* Signal Filter Tabs */}
      <div className="mt-5 flex gap-1.5 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            filter === "all"
              ? "bg-white/15 text-white font-semibold"
              : "text-slate-400 hover:text-white"
          }`}
        >
          All ({relTotal + supTotal + 1})
        </button>
        <button
          type="button"
          onClick={() => setFilter("isrel")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            filter === "isrel"
              ? "bg-emerald-400/20 text-emerald-300 font-semibold"
              : "text-slate-400 hover:text-white"
          }`}
        >
          IsREL ({relTotal})
        </button>
        <button
          type="button"
          onClick={() => setFilter("issup")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            filter === "issup"
              ? "bg-sky-400/20 text-sky-300 font-semibold"
              : "text-slate-400 hover:text-white"
          }`}
        >
          IsSUP ({supTotal})
        </button>
        <button
          type="button"
          onClick={() => setFilter("isuse")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            filter === "isuse"
              ? "bg-purple-400/20 text-purple-300 font-semibold"
              : "text-slate-400 hover:text-white"
          }`}
        >
          IsUSE (1)
        </button>
      </div>

      {/* Badges Container - compact scrollable grid */}
      <div className="mt-4 max-h-72 overflow-y-auto pr-1 space-y-2">
        {(filter === "all" || filter === "isuse") && (
          <DecisionBadge
            label="IsUSE"
            value={isuseDecision}
            description="Overall groundedness & utility of final answer"
          />
        )}

        {(filter === "all" || filter === "issup") && (
          <div className="space-y-1.5">
            {filter === "all" && supTotal > 0 && (
              <p className="text-[11px] font-semibold text-sky-400/80 pt-1">
                Support Checks (IsSUP)
              </p>
            )}
            {issupDecisions.length > 0 ? (
              issupDecisions.map((value, index) => (
                <DecisionBadge
                  key={`sup-${index}`}
                  label={`IsSUP ${index + 1}`}
                  value={value}
                  description={`Passage ${index + 1} supports generation`}
                />
              ))
            ) : (
              filter === "issup" && (
                <p className="text-xs text-slate-500 py-2 text-center">No IsSUP checks recorded</p>
              )
            )}
          </div>
        )}

        {(filter === "all" || filter === "isrel") && (
          <div className="space-y-1.5">
            {filter === "all" && relTotal > 0 && (
              <p className="text-[11px] font-semibold text-emerald-400/80 pt-1">
                Relevance Checks (IsREL)
              </p>
            )}
            {isrelDecisions.length > 0 ? (
              isrelDecisions.map((value, index) => (
                <DecisionBadge
                  key={`rel-${index}`}
                  label={`IsREL ${index + 1}`}
                  value={value}
                  description={`Node ${index + 1} relevant to hop query`}
                />
              ))
            ) : (
              filter === "isrel" && (
                <p className="text-xs text-slate-500 py-2 text-center">No IsREL checks recorded</p>
              )
            )}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-white/5 pt-3 text-[11px] text-slate-500 flex justify-between">
        <span>Evaluated by Self-RAG Critiquer</span>
        <span>{relPass + supPass + (isuseDecision ? 1 : 0)} Passed</span>
      </div>
    </section>
  );
}
