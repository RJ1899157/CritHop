"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import AnswerCard from "@/components/AnswerCard";
import CritiquePanel from "@/components/CritiquePanel";
import HopTrace from "@/components/HopTrace";
import type { QueryResult } from "@/lib/api";
import { useQueryResult } from "@/context/ResultContext";

const SAMPLE_RESULT: QueryResult = {
  question: "Were Scott Derrickson and Ed Wood of the same nationality?",
  answer: "Yes. Both Scott Derrickson and Ed Wood are American filmmakers. Scott Derrickson was born in Los Angeles, California, and Ed Wood was born in Poughkeepsie, New York.",
  hop_trace: [
    {
      hop: 1,
      passages_considered: [0, 1, 3, 4, 8],
      isrel_decisions: { "0": true, "1": true, "3": false, "4": true, "8": false },
      reasoning_step: "Were Scott Derrickson and Ed Wood of the same nationality?",
      selected_passages: [0],
      next_node: 4,
      llm_reasoning_step: "Passage #0 confirms Scott Derrickson is American. Now search for Ed Wood's nationality in adjacent passages."
    },
    {
      hop: 2,
      passages_considered: [1, 2, 5, 6, 7],
      isrel_decisions: { "1": true, "2": false, "5": false, "6": false, "7": false },
      reasoning_step: "Find Ed Wood's nationality and compare it to Scott Derrickson's nationality (American).",
      selected_passages: [1],
      next_node: 1,
      llm_reasoning_step: "Passage #1 confirms Ed Wood was an American filmmaker. Both subjects share American nationality."
    },
    {
      hop: 3,
      passages_considered: [0, 1, 4],
      isrel_decisions: { "0": true, "1": true, "4": true },
      reasoning_step: "Verify consistency across biographical passages for Scott Derrickson (#0) and Ed Wood (#1).",
      selected_passages: [4],
      next_node: null,
      llm_reasoning_step: "Both subjects are confirmed American. Synthesize final grounded answer."
    }
  ],
  critique_log: {
    isrel_decisions: [true, true, false, true, false, true, false, false, false, false],
    issup_decisions: [true, true, true],
    isuse_decision: true
  },
  supporting_passages: [
    "Scott Derrickson: Scott Derrickson (born July 16, 1966) is an American director, screenwriter and producer. He lives in Los Angeles, California. He is best known for directing horror films such as \"Sinister\", \"The Exorcism of Emily Rose\", and \"Deliver Us From Evil\", as well as the 2016 Marvel Cinematic Universe installment, \"Doctor Strange.\"",
    "Ed Wood: Edward Davis Wood Jr. (October 10, 1924 – December 10, 1978) was an American filmmaker, actor, writer, producer, and director. Wood directed several low-budget science fiction and horror films.",
    "Doctor Strange (film): Doctor Strange is a 2016 American superhero film directed by Scott Derrickson from a screenplay he wrote with Jon Spaihts and C. Robert Cargill."
  ],
  retrieval_retry: false,
  graph_data: {
    nodes: [
      { id: 0, title: "Scott Derrickson", snippet: "Scott Derrickson (born July 16, 1966) is an American director...", text: "Scott Derrickson (born July 16, 1966) is an American director, screenwriter and producer. He lives in Los Angeles, California. He is best known for directing horror films such as Sinister, The Exorcism of Emily Rose, and Doctor Strange." },
      { id: 1, title: "Ed Wood", snippet: "Edward Davis Wood Jr. was an American filmmaker, actor, writer...", text: "Edward Davis Wood Jr. (October 10, 1924 – December 10, 1978) was an American filmmaker, actor, writer, producer, and director. In the 1950s, Wood directed several low-budget science fiction and horror films." },
      { id: 2, title: "Ed Wood (film)", snippet: "Ed Wood is a 1994 American biographical period comedy-drama film...", text: "Ed Wood is a 1994 American biographical period comedy-drama film directed and produced by Tim Burton, and starring Johnny Depp as cult filmmaker Ed Wood." },
      { id: 3, title: "Sinister (film)", snippet: "Sinister is a 2012 supernatural horror film directed by Scott Derrickson...", text: "Sinister is a 2012 supernatural horror film directed by Scott Derrickson and written by C. Robert Cargill and Derrickson." },
      { id: 4, title: "Doctor Strange (film)", snippet: "Doctor Strange is a 2016 American superhero film based on Marvel Comics...", text: "Doctor Strange is a 2016 American superhero film directed by Scott Derrickson from a screenplay he wrote with Jon Spaihts and C. Robert Cargill." },
      { id: 5, title: "Plan 9 from Outer Space", snippet: "Plan 9 from Outer Space is a 1959 American independent science fiction film...", text: "Plan 9 from Outer Space is a 1959 American independent science fiction horror film written, produced, directed, and edited by Ed Wood." },
      { id: 6, title: "Glen or Glenda", snippet: "Glen or Glenda is a 1953 American docudrama film written and directed by Ed Wood...", text: "Glen or Glenda is a 1953 American docudrama film written, directed by, and starring Ed Wood, featuring Bela Lugosi." },
      { id: 7, title: "Bride of the Monster", snippet: "Bride of the Monster is a 1955 American science fiction horror film...", text: "Bride of the Monster is a 1955 American science fiction horror film directed and co-written by Edward D. Wood Jr." },
      { id: 8, title: "The Exorcism of Emily Rose", snippet: "The Exorcism of Emily Rose is a 2005 American supernatural horror legal drama...", text: "The Exorcism of Emily Rose is a 2005 American supernatural horror legal drama film directed by Scott Derrickson." },
      { id: 9, title: "Deliver Us from Evil", snippet: "Deliver Us from Evil is a 2014 American supernatural horror film directed by Scott Derrickson...", text: "Deliver Us from Evil is a 2014 American supernatural horror film directed by Scott Derrickson and produced by Jerry Bruckheimer." }
    ],
    edges: [
      { source: 0, target: 3, weight: 0.85 },
      { source: 0, target: 4, weight: 0.92 },
      { source: 0, target: 8, weight: 0.88 },
      { source: 0, target: 9, weight: 0.81 },
      { source: 1, target: 2, weight: 0.90 },
      { source: 1, target: 5, weight: 0.87 },
      { source: 1, target: 6, weight: 0.83 },
      { source: 1, target: 7, weight: 0.84 },
      { source: 0, target: 1, weight: 0.76 },
      { source: 4, target: 1, weight: 0.72 }
    ]
  }
};

export default function ResultsPage() {
  const { result, setResult } = useQueryResult();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("sample") === "true") {
        setResult(SAMPLE_RESULT);
      }
    }
  }, [setResult]);

  function loadSample() {
    setResult(SAMPLE_RESULT);
  }

  const QUICK_QUESTIONS = [
    { q: "Were Scott Derrickson and Ed Wood of the same nationality?", ds: "hotpotqa" },
    { q: "Who is the spouse of the Green performer?", ds: "musique" },
    { q: "Who is the mother of the director of film Polish-Russian War (Film)?", ds: "2wikimultihopqa" },
  ];

  if (!result) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">No active query in session</h2>
          <p className="mt-2 max-w-sm mx-auto text-sm text-slate-400">
            Submit a multi-hop question on the query page, or load a pre-computed sample result to inspect the reasoning path and critique signals.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={loadSample}
              className="rounded-2xl border border-emerald-400/40 bg-emerald-400/15 px-5 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-400/25"
            >
              Load Sample Result
            </button>
            <Link
              href="/"
              className="rounded-2xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Run a Query
            </Link>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Or run a benchmark question directly:
            </p>
            <div className="space-y-2">
              {QUICK_QUESTIONS.map((item, idx) => (
                <Link
                  key={idx}
                  href={`/?question=${encodeURIComponent(item.q)}&dataset=${item.ds}&autoRun=true`}
                  className="block rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-300 hover:border-emerald-400/30 hover:bg-emerald-400/5 hover:text-emerald-300 transition"
                >
                  <span className="font-semibold text-emerald-400 mr-2">[{item.ds}]</span>
                  &ldquo;{item.q}&rdquo; →
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active Query Result
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-slate-400">
              {result.retrieval_retry ? "Fallback retrieval used" : "Initial retrieval accepted"}
            </span>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Evaluated Multi-Hop Question
          </p>
          <h1 className="mt-1.5 max-w-4xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {result.question}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setResult(null)}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-3.5 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-400/20 hover:text-rose-200"
          >
            <span>Clear Result</span>
          </button>
          <Link
            href="/"
            onClick={() => setResult(null)}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 shadow-md shadow-emerald-500/10"
          >
            <span>← Ask Another Question</span>
          </Link>
          <Link
            href="/questions"
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <span>Question Bank</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {/* Top row: Grounded Answer & Self-RAG Critique */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] mb-8">
        <AnswerCard
          answer={result.answer}
          supportingPassages={result.supporting_passages ?? []}
        />
        <CritiquePanel
          isrelDecisions={result.critique_log?.isrel_decisions ?? []}
          issupDecisions={result.critique_log?.issup_decisions ?? []}
          isuseDecision={result.critique_log?.isuse_decision ?? false}
        />
      </div>

      {/* Full-width Reasoning Universe Studio: Playback, 2D Graph, 3D Nebula, Steps & Telemetry */}
      <div className="w-full">
        <HopTrace
          hopTrace={result.hop_trace ?? []}
          graphData={result.graph ?? result.graph_data}
          supportingPassages={result.supporting_passages ?? []}
          critiqueLog={result.critique_log}
          retrievalRetry={result.retrieval_retry}
        />
      </div>
    </main>
  );
}
