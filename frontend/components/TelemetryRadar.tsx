"use client";

type TelemetryRadarProps = {
  hopTrace?: Array<Record<string, unknown>>;
  isrelDecisions?: boolean[];
  issupDecisions?: boolean[];
  isuseDecision?: boolean;
  retrievalRetry?: boolean;
  supportingCount?: number;
  totalPassages?: number;
};

export default function TelemetryRadar({
  hopTrace = [],
  isrelDecisions = [],
  issupDecisions = [],
  isuseDecision = true,
  retrievalRetry = false,
  supportingCount = 0,
  totalPassages = 10,
}: TelemetryRadarProps) {
  const totalIsrel = isrelDecisions.length;
  const keptCount = isrelDecisions.filter(Boolean).length;
  const prunedCount = totalIsrel - keptCount;
  const pruneEfficiency = totalIsrel > 0 ? Math.round((prunedCount / totalIsrel) * 100) : 0;

  const totalIssup = issupDecisions.length;
  const supportedCount = issupDecisions.filter(Boolean).length;
  const supportRatio = totalIssup > 0 ? Math.round((supportedCount / totalIssup) * 100) : 100;

  const hopCount = hopTrace.length;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.24em] text-cyan-400">
            System Telemetry
          </p>
          <h3 className="mt-1 text-lg font-bold text-white">Self-RAG & Traversal Metrics</h3>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-mono text-cyan-300">
          Live Diagnostics
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Metric 1: Pruning Efficiency */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="text-[11px] font-mono text-slate-400">IsREL SLM Pruning</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-cyan-300">{pruneEfficiency}%</span>
            <span className="text-xs text-slate-500">pruned</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-rose-400 transition-all duration-500"
              style={{ width: `${pruneEfficiency}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500 font-mono">
            <span>{prunedCount} noise pruned</span>
            <span>{keptCount} kept</span>
          </div>
        </div>

        {/* Metric 2: Support Verification */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="text-[11px] font-mono text-slate-400">IsSUP Evidence Support</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-300">{supportRatio}%</span>
            <span className="text-xs text-slate-500">grounded</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-500"
              style={{ width: `${supportRatio}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500 font-mono">
            <span>{supportedCount} verified</span>
            <span>{totalIssup - supportedCount} unverified</span>
          </div>
        </div>

        {/* Metric 3: Groundedness Decision */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="text-[11px] font-mono text-slate-400">IsUSE Groundedness</div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full ${
                isuseDecision ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" : "bg-rose-400"
              }`}
            />
            <span className="text-lg font-bold font-mono text-white">
              {isuseDecision ? "VALID" : "RETRY"}
            </span>
          </div>
          <p className="mt-3 text-[10px] leading-tight text-slate-400">
            {retrievalRetry
              ? "Fallback retrieval branch activated during traversal."
              : "High confidence answer directly supported by evidence."}
          </p>
        </div>

        {/* Metric 4: Traversal Depth */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="text-[11px] font-mono text-slate-400">Traversal Depth</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-purple-300">{hopCount}</span>
            <span className="text-xs text-slate-500">hops</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {Array.from({ length: Math.max(3, hopCount) }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < hopCount ? "bg-purple-400 shadow-sm shadow-purple-400/50" : "bg-slate-800"
                }`}
              />
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 font-mono">
            {supportingCount} final supporting node{supportingCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Hardware & Pipeline Specification Bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300">Inference Core:</span>
          <span className="text-cyan-400">Qwen 2.5 27B</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">Embeddings:</span>
          <span className="text-purple-400">BGE Base v1.5</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">Retriever:</span>
          <span className="text-emerald-400">Hybrid BM25 + Dense</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">Phase 2 SLM:</span>
          <span className="text-cyan-400">IsREL Neural Classifier</span>
        </div>
      </div>
    </div>
  );
}
