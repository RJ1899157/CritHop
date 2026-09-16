"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { queryCritHopStream, type QueryResult, type StreamEvent, type GraphData } from "@/lib/api";
import { useQueryResult } from "@/context/ResultContext";

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

type StreamState = {
  stageMessage: string;
  graph: { nodes: number; edges: number } | null;
  graphData: GraphData | null;
  retrieval: { count: number } | null;
  hops: Array<{ hop: number; kept?: number; pruned?: number; reasoning?: string }>;
  critique: { supporting: number; isuse: boolean } | null;
  logs: string[];
};

const INITIAL_STREAM_STATE: StreamState = {
  stageMessage: "",
  graph: null,
  graphData: null,
  retrieval: null,
  hops: [],
  critique: null,
  logs: [],
};

type QueryBoxProps = {
  onResult?: (result: QueryResult) => void;
  initialQuestion?: string;
  initialDataset?: string;
};

export default function QueryBox({ onResult, initialQuestion, initialDataset }: QueryBoxProps) {
  const router = useRouter();
  const { setResult } = useQueryResult();
  const [question, setQuestion] = useState(initialQuestion || "");
  const [dataset, setDataset] = useState(initialDataset || "hotpotqa");
  const [isLoading, setIsLoading] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
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
      const shouldAutoRun = params.get("autoRun") === "true";
      if (urlQ) setQuestion(urlQ);
      if (urlDs) setDataset(urlDs);
      if (shouldAutoRun && urlQ) {
        void runQuery(urlQ, urlDs || dataset);
      }
    }
  }, []);

  const samples = SAMPLE_QUESTIONS[dataset] || [];

  function handleStreamEvent(ev: StreamEvent) {
    if (ev.message) {
      setStreamState((prev) => ({
        ...prev,
        stageMessage: ev.message || prev.stageMessage,
        logs: [...prev.logs.slice(-4), ev.message!],
      }));
    }

    if (ev.event === "graph_built" && ev.nodes !== undefined) {
      setStreamState((prev) => ({
        ...prev,
        graph: { nodes: ev.nodes!, edges: ev.edges || 0 },
        graphData: ev.graph_data || null,
      }));
    } else if (ev.event === "retrieval_complete" && ev.count !== undefined) {
      setStreamState((prev) => ({
        ...prev,
        retrieval: { count: ev.count! },
      }));
    } else if (ev.event === "isrel_decisions" && ev.hop !== undefined) {
      setStreamState((prev) => {
        const existingHopIdx = prev.hops.findIndex((h) => h.hop === ev.hop);
        if (existingHopIdx >= 0) {
          const updated = [...prev.hops];
          updated[existingHopIdx] = {
            ...updated[existingHopIdx],
            kept: ev.kept,
            pruned: ev.pruned,
          };
          return { ...prev, hops: updated };
        }
        return {
          ...prev,
          hops: [...prev.hops, { hop: ev.hop!, kept: ev.kept, pruned: ev.pruned }],
        };
      });
    } else if (ev.event === "hop_complete" && ev.hop !== undefined) {
      setStreamState((prev) => {
        const existingHopIdx = prev.hops.findIndex((h) => h.hop === ev.hop);
        if (existingHopIdx >= 0) {
          const updated = [...prev.hops];
          updated[existingHopIdx] = {
            ...updated[existingHopIdx],
            reasoning: ev.next_reasoning_step,
          };
          return { ...prev, hops: updated };
        }
        return {
          ...prev,
          hops: [...prev.hops, { hop: ev.hop!, reasoning: ev.next_reasoning_step }],
        };
      });
    } else if (ev.event === "critique_complete") {
      setStreamState((prev) => ({
        ...prev,
        critique: {
          supporting: ev.supporting_count ?? 0,
          isuse: Boolean(ev.isuse_score),
        },
      }));
    }
  }

  async function runQuery(targetQuestion: string, targetDataset: string) {
    setError("");

    const normalizedQuestion = targetQuestion.trim();
    if (!normalizedQuestion) {
      setError("Enter a question to continue.");
      return;
    }

    setIsLoading(true);
    setStreamState({
      ...INITIAL_STREAM_STATE,
      stageMessage: "Initiating hop-by-hop streaming pipeline...",
    });

    try {
      const result = await queryCritHopStream(
        normalizedQuestion,
        targetDataset,
        handleStreamEvent,
      );

      setResult(result);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runQuery(question, dataset);
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

      {samples.length > 0 && !isLoading && (
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

      {/* Live SSE Stream Progress Card */}
      {isLoading && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/20 p-4 shadow-inner space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Live Hop-by-Hop Stream (SSE)
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Realtime Events</span>
          </div>

          <p className="text-xs font-medium text-emerald-100">
            {streamState.stageMessage || "Executing pipeline..."}
          </p>

          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            {/* Stage 1: Graph */}
            <div className={`rounded-xl border p-2 ${streamState.graph ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.02] text-slate-400'}`}>
              <div className="font-semibold">1. Graph</div>
              <div className="mt-0.5 text-[10px]">
                {streamState.graph ? `${streamState.graph.nodes}n · ${streamState.graph.edges}e` : 'Building...'}
              </div>
            </div>

            {/* Stage 2: Retrieval */}
            <div className={`rounded-xl border p-2 ${streamState.retrieval ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.02] text-slate-400'}`}>
              <div className="font-semibold">2. Retrieval</div>
              <div className="mt-0.5 text-[10px]">
                {streamState.retrieval ? `${streamState.retrieval.count} seeds ranked` : 'Pending'}
              </div>
            </div>

            {/* Stage 3: Hops */}
            <div className={`rounded-xl border p-2 ${streamState.hops.length > 0 ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.02] text-slate-400'}`}>
              <div className="font-semibold">3. Traversal</div>
              <div className="mt-0.5 text-[10px]">
                {streamState.hops.length > 0 ? `${streamState.hops.length} hop(s) active` : 'Pending'}
              </div>
            </div>

            {/* Stage 4: Critiques */}
            <div className={`rounded-xl border p-2 ${streamState.critique ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.02] text-slate-400'}`}>
              <div className="font-semibold">4. Critiques</div>
              <div className="mt-0.5 text-[10px]">
                {streamState.critique ? `${streamState.critique.supporting} verified` : 'Pending'}
              </div>
            </div>
          </div>

          {/* Hop decisions ticker */}
          {streamState.hops.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {streamState.hops.map((h) => (
                <div key={h.hop} className="flex items-center justify-between rounded-lg bg-black/40 px-2.5 py-1 text-[11px] text-slate-300">
                  <span className="font-mono text-emerald-400">Hop {h.hop} IsREL:</span>
                  <span>
                    {h.kept !== undefined ? (
                      <>
                        <span className="text-emerald-300 font-medium">{h.kept} kept</span>
                        <span className="text-slate-500 mx-1.5">/</span>
                        <span className="text-rose-300">{h.pruned} pruned</span>
                      </>
                    ) : (
                      "Evaluating candidates..."
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
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
        className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-75 shadow-lg shadow-emerald-500/10"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin text-slate-950" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Streaming multi-hop reasoning...
          </span>
        ) : (
          "Run CritHop"
        )}
      </button>
    </form>
  );
}
