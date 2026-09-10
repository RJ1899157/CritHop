import type { ComparisonTable as ComparisonTableData } from "@/lib/api";

type ComparisonTableProps = {
  comparison: ComparisonTableData;
};

const rows = ["BM25", "BGE", "Self-RAG", "HopRAG", "CritHop", "Phase 2 (reranker-slm)"];

export default function ComparisonTable({ comparison }: ComparisonTableProps) {
  const datasets = Object.keys(comparison);
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-slate-950/50 text-xs uppercase tracking-widest text-slate-400">
          <tr>
            <th className="px-5 py-4">Method</th>
            {datasets.map((dataset) => <th key={dataset} className="px-5 py-4">{dataset}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((method) => {
            const isCritHop = method === "CritHop";
            const isPhaseTwo = method.startsWith("Phase 2");
            return (
              <tr key={method} className={`border-b border-white/5 last:border-0 ${isCritHop ? "bg-emerald-400/10" : isPhaseTwo ? "bg-sky-400/10" : ""}`}>
                <td className={`px-5 py-4 font-semibold ${isCritHop ? "text-emerald-300" : isPhaseTwo ? "text-sky-300" : "text-slate-400"}`}>
                  {method}
                </td>
                {datasets.map((dataset) => {
                  const score = isPhaseTwo ? { EM: null, F1: null } : comparison[dataset]?.[method];
                  return <td key={dataset} className="px-5 py-4 text-slate-300">{score?.EM == null ? "—" : `EM ${score.EM.toFixed(2)} · F1 ${score.F1?.toFixed(2)}`}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
