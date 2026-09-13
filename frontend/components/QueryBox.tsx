"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { queryCritHop, type QueryResult } from "@/lib/api";

const SAMPLE_QUESTIONS: Record<string, string[]> = {
  hotpotqa: [
    "Were Scott Derrickson and Ed Wood of the same nationality?",
    "What government position was held by the woman who portrayed Corliss Archer in the film Kiss and Tell?",
    "What science fantasy young adult series, told in first person, has a set of companion books narrating the stories of enslaved worlds and alien species?",
    "Are the Laleli Mosque and Esma Sultan Mansion located in the same neighborhood?",
  ],
  musique: [
    "Who is the spouse of the Green performer?",
    "Who founded the company that distributed the film UHF?",
    "What administrative territorial entity is the owner of Ciudad Deportiva located?",
    "Where is Ulrich Walter's employer headquartered?",
    "Which company owns the manufacturer of Learjet 60?",
  ],
  "2wikimultihopqa": [
    "Who is the mother of the director of film Polish-Russian War (Film)?",
    "Which film came out first, Blind Shaft or The Mask Of Fu Manchu?",
    "When did John V, Prince Of Anhalt-Zerbst's father die?",
    "What is the award that the director of film Wearing Velvet Slippers Under A Golden Umbrella won?",
    "Where was the director of film Ronnie Rocket born?",
  ],
};

const LOADING_STAGES = [
  "Retrieving initial evidence via BM25 + BGE...",
  "Building semantic passage graph...",
  "Traversing multi-hop reasoning path...",
  "Phase 2 SLM IsREL critique & pruning...",
  "Evaluating support signals (IsSUP)...",
  "Synthesizing and critiquing grounded answer...",
];

type QueryBoxProps = {
  onResult?: (result: QueryResult) => void;
  initialQuestion?: string;
  initialDataset?: string;
};

export default function QueryBox({ onResult, initialQuestion, initialDataset }: QueryBoxProps) {
  const router = useRouter();
  const [question, setQuestion] = useState(initialQuestion || "");
  const [dataset, setDataset] = useState(initialDataset || "hotpotqa");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStageIdx, setLoadingStageIdx] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialQuestion !== undefined) {
      setQuestion(initialQuestion);
    }
  }, [initialQuestion]);

  useEffect(() => {
    if (initialDataset !== undefined) {
      setDataset(initialDataset);
    }
  }, [initialDataset]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlQ = params.get("question");
      const urlDs = params.get("dataset");
      if (urlQ) setQuestion(urlQ);
      if (urlDs) setDataset(urlDs);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setLoadingStageIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingStageIdx((prev) => (prev + 1) % LOADING_STAGES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isLoading]);

  const samples = SAMPLE_QUESTIONS[dataset] || [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      setError("Enter a question to continue.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await queryCritHop(normalizedQuestion, dataset);
      sessionStorage.setItem("crithop-result", JSON.stringify(result));
      if (onResult) {
        onResult(result);
      } else {
        router.push("/results");
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The CritHop API could not be reached. Ensure the backend container is running on port 8000.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="question" className="text-sm font-medium text-slate-200">
            Question
          </label>
          <span className="text-xs text-slate-400">Context retrieved automatically</span>
        </div>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a multi-hop question or select a sample below..."
          rows={3}
          className="w-full resize-y rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="dataset" className="text-sm font-medium text-slate-200">
          Dataset
        </label>
        <select
          id="dataset"
          value={dataset}
          onChange={(event) => {
            setDataset(event.target.value);
            setQuestion("");
          }}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20"
        >
          <option value="hotpotqa">HotpotQA</option>
          <option value="musique">MuSiQue</option>
          <option value="2wikimultihopqa">2WikiMultiHopQA</option>
        </select>
      </div>

      {samples.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Quick test samples:
          </p>
          <div className="flex flex-col gap-1.5">
            {samples.map((sampleQ, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuestion(sampleQ)}
                className="text-left text-xs text-slate-300 hover:text-emerald-300 transition rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 hover:border-emerald-400/30 hover:bg-emerald-400/5"
              >
                &ldquo;{sampleQ}&rdquo;
              </button>
            ))}
          </div>
          <div className="pt-1 text-right">
            <a
              href="/questions"
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition hover:underline"
            >
              Explore Full Question Banks →
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-xs leading-5 text-red-200">
          <p className="font-semibold">Query Failed:</p>
          <p>{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex w-full flex-col items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-75 shadow-lg shadow-emerald-500/10"
      >
        {isLoading ? (
          <span className="flex flex-col items-center gap-1.5 py-0.5">
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin text-slate-950" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Traversing evidence graph...
            </span>
            <span className="text-[11px] font-normal text-slate-800">
              {LOADING_STAGES[loadingStageIdx]}
            </span>
          </span>
        ) : (
          "Run CritHop"
        )}
      </button>
    </form>
  );
}
