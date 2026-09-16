"use client";

import { useEffect, useState } from "react";
import type { GraphNode } from "@/lib/api";

type NodeInspectionModalProps = {
  node: GraphNode | null;
  onClose: () => void;
  onSelectNeighbor?: (nodeId: number) => void;
  neighbors?: GraphNode[];
  isrelStatus?: boolean | null;
  isSupporting?: boolean;
  hopNumber?: number | null;
};

export default function NodeInspectionModal({
  node,
  onClose,
  onSelectNeighbor,
  neighbors = [],
  isrelStatus,
  isSupporting,
  hopNumber,
}: NodeInspectionModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!node) return null;

  async function handleCopy() {
    if (!node) return;
    try {
      await navigator.clipboard.writeText(node.text || node.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl rounded-3xl border border-cyan-500/30 bg-[#0a0d14]/95 p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-cyan-300">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Node #{node.id}
              </span>

              {isSupporting && (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-0.5 text-[11px] font-mono font-semibold text-emerald-300">
                  ★ Supporting Evidence
                </span>
              )}

              {hopNumber !== null && hopNumber !== undefined && (
                <span className="rounded-full border border-purple-400/40 bg-purple-400/15 px-3 py-0.5 text-[11px] font-mono font-semibold text-purple-300">
                  Hop {hopNumber} Visited
                </span>
              )}

              {isrelStatus === false && (
                <span className="rounded-full border border-rose-400/40 bg-rose-400/15 px-3 py-0.5 text-[11px] font-mono font-semibold text-rose-300">
                  ✕ Pruned by IsREL
                </span>
              )}

              {isrelStatus === true && (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-0.5 text-[11px] font-mono font-semibold text-emerald-300">
                  ✓ Kept by IsREL
                </span>
              )}
            </div>

            <h3 className="mt-3 text-xl font-bold text-white sm:text-2xl">
              {node.title || `Passage #${node.id}`}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Passage Content */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-slate-400">
              Evidence Passage Text
            </span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {copied ? "✓ Copied" : "📋 Copy Text"}
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-black/60 p-4 text-xs leading-relaxed text-slate-300 font-mono select-text">
            {node.text || node.snippet || "No text available for this passage."}
          </div>
        </div>

        {/* Connected Neighbors */}
        {neighbors.length > 0 && (
          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-medium uppercase tracking-wider text-slate-400">
                Connected Semantic Neighbors ({neighbors.length})
              </span>
              <span className="text-[11px] text-slate-500">Similarity Edge &ge; 0.3</span>
            </div>

            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {neighbors.map((nb) => (
                <button
                  key={nb.id}
                  onClick={() => onSelectNeighbor?.(nb.id)}
                  className="group inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-200"
                >
                  <span className="font-mono text-cyan-400 group-hover:underline">
                    #{nb.id}
                  </span>
                  <span className="max-w-[140px] truncate">{nb.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="mt-7 flex items-center justify-end gap-3 border-t border-white/10 pt-5">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
