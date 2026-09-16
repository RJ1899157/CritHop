"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import ReasoningGraph2D from "./ReasoningGraph2D";
import ReasoningGraph3D from "./ReasoningGraph3D";
import ReasoningPlayback, { type PlaybackFrame } from "./ReasoningPlayback";
import TelemetryRadar from "./TelemetryRadar";
import NodeInspectionModal from "./NodeInspectionModal";
import type { GraphData, GraphNode } from "@/lib/api";

type HopTraceProps = {
  hopTrace: Array<Record<string, unknown>>;
  graphData?: GraphData;
  supportingPassages?: string[];
  critiqueLog?: {
    isrel_decisions: boolean[];
    issup_decisions: boolean[];
    isuse_decision: boolean;
  };
  retrievalRetry?: boolean;
};

type ViewMode = "studio" | "steps" | "telemetry";

export default function HopTrace({
  hopTrace = [],
  graphData,
  supportingPassages = [],
  critiqueLog,
  retrievalRetry = false,
}: HopTraceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("studio");
  const [graphDimension, setGraphDimension] = useState<"2d" | "3d">("2d");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeFrame, setActiveFrame] = useState<PlaybackFrame | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("dim") === "3d") {
        setGraphDimension("3d");
      }
      const tabParam = params.get("tab");
      if (tabParam === "steps" || tabParam === "telemetry" || tabParam === "studio") {
        setViewMode(tabParam as ViewMode);
      }
    }
  }, []);

  // Stabilize frame change notification callback
  const handleFrameChange = useCallback((frame: PlaybackFrame) => {
    setActiveFrame((prev) => (prev?.stepIndex === frame.stepIndex ? prev : frame));
  }, []);

  // Memoize active graph data to avoid recreating objects on each render
  const activeGraphData: GraphData = useMemo(() => {
    if (graphData && graphData.nodes?.length > 0) {
      return graphData;
    }
    const nodes: GraphNode[] = [];
    const edges: Array<{ source: number; target: number; weight?: number }> = [];
    const seenIndices = new Set<number>();

    hopTrace.forEach((hop) => {
      const considered = Array.isArray(hop.passages_considered) ? hop.passages_considered : [];
      considered.forEach((idx) => {
        const num = Number(idx);
        if (!seenIndices.has(num)) {
          seenIndices.add(num);
          nodes.push({
            id: num,
            title: `Evidence Passage #${num}`,
            snippet: `Passage index ${num} considered during multi-hop traversal.`,
            text: `Full text for passage #${num} evaluated by the CritHop pipeline.`,
          });
        }
      });
    });

    // Add supporting passages if missing
    supportingPassages.forEach((sp, i) => {
      if (!seenIndices.has(i)) {
        seenIndices.add(i);
        const title = sp.includes(":") ? sp.split(":")[0].trim() : `Supporting #${i}`;
        nodes.push({
          id: i,
          title,
          snippet: sp.slice(0, 120),
          text: sp,
        });
      }
    });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if ((i + j) % 2 === 0 || Math.abs(i - j) === 1) {
          edges.push({ source: nodes[i].id, target: nodes[j].id, weight: 0.8 });
        }
      }
    }

    return { nodes, edges };
  }, [graphData, hopTrace, supportingPassages]);

  // Find neighbors of selected node
  const selectedNeighbors = selectedNode
    ? activeGraphData.edges
        .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
        .map((e) => {
          const targetId = e.source === selectedNode.id ? e.target : e.source;
          return activeGraphData.nodes.find((n) => n.id === targetId);
        })
        .filter((n): n is GraphNode => Boolean(n))
    : [];

  const isSupporting = selectedNode
    ? supportingPassages.some((sp) => sp.includes(selectedNode.title) || selectedNode.text.includes(sp))
    : false;

  let hopNum: number | null = null;
  let isrelStatus: boolean | null = null;

  if (selectedNode) {
    hopTrace.forEach((h, idx) => {
      const selected = Array.isArray(h.selected_passages) ? h.selected_passages : [];
      if (selected.includes(selectedNode.id)) {
        hopNum = typeof h.hop === "number" ? h.hop : idx + 1;
      }
      const decisions = (h.isrel_decisions && typeof h.isrel_decisions === "object")
        ? (h.isrel_decisions as Record<string, boolean>)
        : {};
      if (selectedNode.id in decisions) {
        isrelStatus = decisions[selectedNode.id];
      }
    });
  }

  // Render view body
  const viewContent = (
    <div className="space-y-6">
      {viewMode === "studio" && (
        <div className="space-y-4">
          <ReasoningPlayback
            graphData={activeGraphData}
            hopTrace={hopTrace}
            supportingPassages={supportingPassages}
            onFrameChange={handleFrameChange}
          />

          {/* Sub-toggle for Dimension: 2D Physics Canvas vs 3D WebGL Nebula */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Dimension View:</span>
              <div className="inline-flex rounded-xl border border-white/10 bg-black/60 p-1">
                <button
                  onClick={() => setGraphDimension("2d")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-mono font-medium transition ${
                    graphDimension === "2d"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>⚡ 2D Force Physics</span>
                </button>
                <button
                  onClick={() => setGraphDimension("3d")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-mono font-medium transition ${
                    graphDimension === "3d"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-500/20 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>🌌 3D WebGL Nebula</span>
                </button>
              </div>
            </div>

            <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
              {graphDimension === "2d"
                ? "Drag nodes to pin · Scroll to zoom · Click to inspect passage"
                : "Left-drag to orbit · Right-drag to pan · Scroll to zoom"}
            </span>
          </div>

          {graphDimension === "2d" ? (
            <ReasoningGraph2D
              graphData={activeGraphData}
              hopTrace={hopTrace}
              supportingPassages={supportingPassages}
              playbackFrame={activeFrame || undefined}
              onSelectNode={(node) => setSelectedNode(node)}
              height={isFullscreen ? 650 : 500}
            />
          ) : (
            <ReasoningGraph3D
              graphData={activeGraphData}
              hopTrace={hopTrace}
              supportingPassages={supportingPassages}
              playbackFrame={activeFrame || undefined}
              onSelectNode={(node) => setSelectedNode(node)}
              height={isFullscreen ? 650 : 500}
            />
          )}
        </div>
      )}

      {viewMode === "steps" && (
        <div className="space-y-4">
          {hopTrace.length === 0 ? (
            <p className="text-sm text-slate-500">No hop trace was returned.</p>
          ) : (
            hopTrace.map((hop, index) => {
              const hopNum = typeof hop.hop === "number" ? hop.hop : index + 1;
              const decisions = (hop.isrel_decisions && typeof hop.isrel_decisions === "object")
                ? (hop.isrel_decisions as Record<string, boolean>)
                : {};
              const kept = Object.values(decisions).filter(Boolean).length;
              const pruned = Object.values(decisions).length - kept;

              return (
                <div
                  key={index}
                  className="relative rounded-2xl border border-white/10 bg-black/40 p-5 pl-14 transition hover:border-purple-400/40"
                >
                  <div className="absolute left-4 top-5 flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/20 border border-purple-400/40 text-xs font-bold font-mono text-purple-300">
                    {hopNum}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-base font-bold text-purple-200">
                      Hop {hopNum} Traversal
                    </h4>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-emerald-300">
                        {kept} kept
                      </span>
                      <span className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-rose-300">
                        {pruned} pruned
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                    <p>
                      <span className="font-mono text-slate-400">Reasoning Target:</span>{" "}
                      <span className="text-slate-200">{String(hop.reasoning_step || "—")}</span>
                    </p>
                    {Boolean(hop.llm_reasoning_step) && (
                      <p>
                        <span className="font-mono text-slate-400">Next Step Plan:</span>{" "}
                        <span className="text-cyan-200">{String(hop.llm_reasoning_step)}</span>
                      </p>
                    )}
                    <p>
                      <span className="font-mono text-slate-400">Passages Considered:</span>{" "}
                      <span className="font-mono text-purple-300">
                        [{Array.isArray(hop.passages_considered) ? hop.passages_considered.join(", ") : "—"}]
                      </span>
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {viewMode === "telemetry" && (
        <TelemetryRadar
          hopTrace={hopTrace}
          isrelDecisions={critiqueLog?.isrel_decisions ?? []}
          issupDecisions={critiqueLog?.issup_decisions ?? []}
          isuseDecision={critiqueLog?.isuse_decision ?? true}
          retrievalRetry={retrievalRetry}
          supportingCount={supportingPassages.length}
          totalPassages={activeGraphData.nodes.length}
        />
      )}
    </div>
  );

  return (
    <section className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md shadow-2xl space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <p className="text-xs font-mono font-bold uppercase tracking-[0.24em] text-cyan-400">
              Interactive Reasoning Universe
            </p>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-white tracking-tight">
            HopTrace, Graph & Traversal Playback
          </h2>
        </div>

        {/* View Mode Buttons */}
        <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/50 p-1.5">
          <button
            onClick={() => setViewMode("studio")}
            className={`rounded-xl px-3 py-1.5 text-xs font-mono font-medium transition ${
              viewMode === "studio"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20 font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🎬 Playback Studio
          </button>
          <button
            onClick={() => setViewMode("steps")}
            className={`rounded-xl px-3 py-1.5 text-xs font-mono font-medium transition ${
              viewMode === "steps"
                ? "bg-white/10 text-white border border-white/20 font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📋 Hop Steps
          </button>
          <button
            onClick={() => setViewMode("telemetry")}
            className={`rounded-xl px-3 py-1.5 text-xs font-mono font-medium transition ${
              viewMode === "telemetry"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20 font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📊 Telemetry
          </button>

          <button
            onClick={() => setIsFullscreen(true)}
            className="ml-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white transition"
            title="Expand Fullscreen"
          >
            ⛶ Fullscreen
          </button>
        </div>
      </div>

      {/* Main Content in normal view */}
      {viewContent}

      {/* Fullscreen Portal into document.body to prevent stacking context or backdrop-blur clipping */}
      {mounted && isFullscreen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[#030508] p-6 overflow-y-auto flex flex-col justify-between animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse" />
              <h3 className="text-xl font-mono font-bold text-white">
                CritHop Knowledge Universe · Fullscreen Studio
              </h3>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-mono font-bold text-white hover:bg-white/20 transition"
            >
              ✕ Exit Fullscreen
            </button>
          </div>

          <div className="flex-1">
            {viewContent}
          </div>
        </div>,
        document.body
      )}

      {/* Node Inspection Modal */}
      <NodeInspectionModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onSelectNeighbor={(nbId) => {
          const nb = activeGraphData.nodes.find((n) => n.id === nbId);
          if (nb) setSelectedNode(nb);
        }}
        neighbors={selectedNeighbors}
        isrelStatus={isrelStatus}
        isSupporting={isSupporting}
        hopNumber={hopNum}
      />
    </section>
  );
}
