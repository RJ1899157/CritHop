"use client";

import { useState, useEffect, useRef } from "react";
import type { GraphData, GraphNode } from "@/lib/api";

export type PlaybackFrame = {
  stepIndex: number;
  totalSteps: number;
  phase: "init" | "retrieval" | "hop_eval" | "hop_prune" | "critique" | "final";
  title: string;
  subtitle: string;
  description: string;
  hopNumber?: number;
  activeCandidateIds: number[];
  keptNodeIds: number[];
  prunedNodeIds: number[];
  traversedNodeIds: number[];
  supportingNodeIds: number[];
  traversalEdges: Array<{ source: number; target: number }>;
};

type ReasoningPlaybackProps = {
  graphData: GraphData;
  hopTrace: Array<Record<string, unknown>>;
  supportingPassages: string[];
  onFrameChange: (frame: PlaybackFrame) => void;
};

export function buildPlaybackFrames(
  graphData: GraphData,
  hopTrace: Array<Record<string, unknown>>,
  supportingPassages: string[]
): PlaybackFrame[] {
  const frames: PlaybackFrame[] = [];

  // Identify supporting nodes
  const supportingIds: number[] = [];
  graphData.nodes.forEach((n) => {
    const isSup = supportingPassages.some(
      (sp) => sp.includes(n.title) || n.text.includes(sp) || sp.includes(n.text.slice(0, 40))
    );
    if (isSup) supportingIds.push(n.id);
  });

  // Frame 0: Initial Knowledge Graph
  frames.push({
    stepIndex: 0,
    totalSteps: 1,
    phase: "init",
    title: "Step 0: Semantic Passage Graph Constructed",
    subtitle: `${graphData.nodes.length} Evidence Nodes · ${graphData.edges.length} Semantic Similarity Edges`,
    description:
      "All retrieved passage candidates are mapped into a connected semantic topology. Nodes represent candidate passages, and edges denote semantic similarity (threshold ≥ 0.3).",
    activeCandidateIds: graphData.nodes.map((n) => n.id),
    keptNodeIds: [],
    prunedNodeIds: [],
    traversedNodeIds: [],
    supportingNodeIds: [],
    traversalEdges: [],
  });

  // Frame 1: Seed Retrieval
  const firstHopConsidered =
    hopTrace.length > 0 && Array.isArray(hopTrace[0].passages_considered)
      ? (hopTrace[0].passages_considered as number[])
      : graphData.nodes.slice(0, 5).map((n) => n.id);

  frames.push({
    stepIndex: 1,
    totalSteps: 1,
    phase: "retrieval",
    title: "Step 1: Hybrid Lexical (BM25) & Dense (BGE) Retrieval",
    subtitle: `${firstHopConsidered.length} Seed Passages Ranked`,
    description:
      "Hybrid retrieval identifies initial entry points into the evidence graph, combining BM25 exact keyword matching with BGE dense semantic embeddings.",
    activeCandidateIds: firstHopConsidered,
    keptNodeIds: [],
    prunedNodeIds: [],
    traversedNodeIds: [],
    supportingNodeIds: [],
    traversalEdges: [],
  });

  // Multi-Hop Traversal & Pruning Frames
  let accumulatedKept: number[] = [];
  let accumulatedPruned: number[] = [];
  let accumulatedTraversed: number[] = [];
  let accumulatedEdges: Array<{ source: number; target: number }> = [];

  hopTrace.forEach((h, hIdx) => {
    const hopNum = typeof h.hop === "number" ? h.hop : hIdx + 1;
    const considered = Array.isArray(h.passages_considered)
      ? (h.passages_considered as number[])
      : [];
    const decisions =
      h.isrel_decisions && typeof h.isrel_decisions === "object"
        ? (h.isrel_decisions as Record<string, boolean>)
        : {};
    const selected = Array.isArray(h.selected_passages)
      ? (h.selected_passages as number[])
      : [];

    const hopKept: number[] = [];
    const hopPruned: number[] = [];
    Object.entries(decisions).forEach(([k, isRel]) => {
      const idx = Number(k);
      if (isRel) hopKept.push(idx);
      else hopPruned.push(idx);
    });

    const reasoningTarget = String(h.reasoning_step || "Multi-hop query step");
    const nextReasoning = String(h.llm_reasoning_step || "");

    // Evaluation Frame for this hop
    frames.push({
      stepIndex: frames.length,
      totalSteps: 1,
      phase: "hop_eval",
      hopNumber: hopNum,
      title: `Hop ${hopNum}: Evaluating ${considered.length} Candidate Passages`,
      subtitle: `Target: "${reasoningTarget.slice(0, 70)}..."`,
      description: `HopTraverser inspects adjacent candidate nodes in the semantic graph to find bridge entities relevant to the question.`,
      activeCandidateIds: considered,
      keptNodeIds: [...accumulatedKept],
      prunedNodeIds: [...accumulatedPruned],
      traversedNodeIds: [...accumulatedTraversed],
      supportingNodeIds: [],
      traversalEdges: [...accumulatedEdges],
    });

    // Pruning & Selection Frame for this hop
    accumulatedKept = Array.from(new Set([...accumulatedKept, ...hopKept]));
    accumulatedPruned = Array.from(new Set([...accumulatedPruned, ...hopPruned]));
    accumulatedTraversed = Array.from(new Set([...accumulatedTraversed, ...selected]));

    if (accumulatedTraversed.length >= 2) {
      const len = accumulatedTraversed.length;
      accumulatedEdges.push({
        source: accumulatedTraversed[len - 2],
        target: accumulatedTraversed[len - 1],
      });
    }

    frames.push({
      stepIndex: frames.length,
      totalSteps: 1,
      phase: "hop_prune",
      hopNumber: hopNum,
      title: `Hop ${hopNum}: Neural IsREL SLM Pruning & Traversal`,
      subtitle: `${hopKept.length} Kept · ${hopPruned.length} Irrelevant Passages Trimmed`,
      description: `The Neural IsREL SLM filters out false-positive distractors. Selected nodes: [${selected.join(
        ", "
      )}]. ${nextReasoning ? `Next planned step: ${nextReasoning.slice(0, 100)}` : ""}`,
      activeCandidateIds: selected,
      keptNodeIds: [...accumulatedKept],
      prunedNodeIds: [...accumulatedPruned],
      traversedNodeIds: [...accumulatedTraversed],
      supportingNodeIds: [],
      traversalEdges: [...accumulatedEdges],
    });
  });

  // Final Frame: Self-RAG Critiques & Grounded Synthesis
  frames.push({
    stepIndex: frames.length,
    totalSteps: 1,
    phase: "final",
    title: "Final Step: Self-RAG Critique & Grounded Answer Synthesis",
    subtitle: `${supportingIds.length} Verified Supporting Passages · IsUSE Confirmed`,
    description:
      "The Generator synthesizes a grounded answer from surviving traversed passages. Self-RAG verifies each sentence with IsSUP (Support verification) and validates overall utility with IsUSE.",
    activeCandidateIds: [],
    keptNodeIds: accumulatedKept,
    prunedNodeIds: accumulatedPruned,
    traversedNodeIds: accumulatedTraversed,
    supportingNodeIds: supportingIds,
    traversalEdges: accumulatedEdges,
  });

  // Set totalSteps
  const total = frames.length;
  frames.forEach((f) => (f.totalSteps = total));
  return frames;
}

export default function ReasoningPlayback({
  graphData,
  hopTrace,
  supportingPassages,
  onFrameChange,
}: ReasoningPlaybackProps) {
  const frames = buildPlaybackFrames(graphData, hopTrace, supportingPassages);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentFrame = frames[currentIdx] || frames[0];

  useEffect(() => {
    onFrameChange(currentFrame);
  }, [currentIdx, currentFrame, onFrameChange]);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const interval = Math.round(1800 / speed);
    timerRef.current = setInterval(() => {
      setCurrentIdx((prev) => {
        if (prev >= frames.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, frames.length]);

  function handlePlayToggle() {
    if (currentIdx >= frames.length - 1) {
      setCurrentIdx(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  }

  function handleStep(dir: "prev" | "next") {
    setIsPlaying(false);
    if (dir === "prev") {
      setCurrentIdx((prev) => Math.max(prev - 1, 0));
    } else {
      setCurrentIdx((prev) => Math.min(prev + 1, frames.length - 1));
    }
  }

  function handleReplay() {
    setIsPlaying(false);
    setCurrentIdx(0);
    setTimeout(() => setIsPlaying(true), 50);
  }

  return (
    <div className="rounded-3xl border border-cyan-500/30 bg-[#060911]/90 p-5 backdrop-blur-xl shadow-xl space-y-4">
      {/* Player Header & Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/20 border border-cyan-400/40 text-cyan-300 font-bold">
            🎬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                Traversal & Trimming Playback
              </span>
              <span className="rounded-full bg-cyan-400/15 border border-cyan-400/30 px-2 py-0.2 text-[10px] font-mono text-cyan-300">
                Step {currentIdx + 1} of {frames.length}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Scrub or replay the multi-hop reasoning sequence to see how passages were trimmed.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Prev */}
          <button
            onClick={() => handleStep("prev")}
            disabled={currentIdx === 0}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Previous Step"
          >
            ⏮
          </button>

          {/* Play / Pause */}
          <button
            onClick={handlePlayToggle}
            className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20"
          >
            {isPlaying ? "⏸ Pause" : currentIdx >= frames.length - 1 ? "↺ Replay" : "▶ Play"}
          </button>

          {/* Next */}
          <button
            onClick={() => handleStep("next")}
            disabled={currentIdx >= frames.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Next Step"
          >
            ⏭
          </button>

          {/* Replay */}
          <button
            onClick={handleReplay}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white transition"
            title="Replay from start"
          >
            ↺
          </button>

          {/* Speed Toggle */}
          <div className="flex items-center rounded-xl border border-white/10 bg-black/40 p-0.5 text-[10px] font-mono">
            {[1, 1.5, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-lg px-2 py-1 transition ${
                  speed === s ? "bg-cyan-400/30 text-cyan-300 font-bold" : "text-slate-400 hover:text-white"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress Timeline Scrubber */}
      <div className="space-y-1.5">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={currentIdx}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIdx(Number(e.target.value));
            }}
            className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer transition"
          />
        </div>

        {/* Milestone Steps Bar */}
        <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1">
          {frames.map((f, i) => (
            <button
              key={i}
              onClick={() => {
                setIsPlaying(false);
                setCurrentIdx(i);
              }}
              className={`hover:text-cyan-300 transition ${
                i === currentIdx ? "text-cyan-400 font-bold underline" : ""
              }`}
            >
              {f.phase === "init"
                ? "Init"
                : f.phase === "retrieval"
                ? "Seeds"
                : f.phase === "hop_eval"
                ? `Hop ${f.hopNumber}`
                : f.phase === "hop_prune"
                ? `Trim ${f.hopNumber}`
                : "Final"}
            </button>
          ))}
        </div>
      </div>

      {/* Active Step Explainer Card */}
      <div className="rounded-2xl border border-white/10 bg-black/50 p-4 transition-all duration-300">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
          <h4 className="text-sm font-bold text-cyan-200">
            {currentFrame.title}
          </h4>
          <span className="text-[11px] font-mono text-slate-400">
            {currentFrame.subtitle}
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {currentFrame.description}
        </p>

        {/* Stats Pill Strip */}
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-1 text-[10px] font-mono">
          {currentFrame.activeCandidateIds.length > 0 && (
            <span className="rounded-lg border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-purple-300">
              ● {currentFrame.activeCandidateIds.length} Active Candidates
            </span>
          )}
          {currentFrame.keptNodeIds.length > 0 && (
            <span className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
              ✓ {currentFrame.keptNodeIds.length} Kept by IsREL
            </span>
          )}
          {currentFrame.prunedNodeIds.length > 0 && (
            <span className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-rose-300">
              ✕ {currentFrame.prunedNodeIds.length} Trimmed
            </span>
          )}
          {currentFrame.supportingNodeIds.length > 0 && (
            <span className="rounded-lg border border-emerald-400/40 bg-emerald-400/20 px-2 py-0.5 text-emerald-300 font-bold">
              ★ {currentFrame.supportingNodeIds.length} Supporting Evidence Verified
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
