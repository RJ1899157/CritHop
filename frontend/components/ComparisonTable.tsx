import type { ComparisonTable as ComparisonTableData } from "@/lib/api";

type ComparisonTableProps = {
  comparison: ComparisonTableData;
};

const rows = ["BM25", "BGE", "Self-RAG", "HopRAG", "CritHop P1", "CritHop P2"];
const datasets = [
  ["hotpotqa", "HotpotQA"],
  ["musique", "MuSiQue"],
  ["2wikimultihopqa", "2Wiki"],
] as const;

export default function ComparisonTable({ comparison }: ComparisonTableProps) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-slate-950/50 text-xs uppercase tracking-widest text-slate-400">
          <tr>
            <th className="px-5 py-4">Method</th>
            {datasets.flatMap(([dataset, label]) => [
              <th key={`${dataset}-em`} className="px-5 py-4">{label} EM</th>,
              <th key={`${dataset}-f1`} className="px-5 py-4">{label} F1</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {rows.map((method) => {
            const isCritHop = method.startsWith("CritHop");
            const isPhaseTwo = method === "CritHop P2";
            const sourceMethod = method === "CritHop P1" ? "CritHop" : method === "CritHop P2" ? "Phase 2 (reranker-slm)" : method;
            return (
              <tr key={method} className={`border-b border-white/5 last:border-0 ${isCritHop ? "bg-emerald-400/10" : isPhaseTwo ? "bg-sky-400/10" : ""}`}>
                <td className={`px-5 py-4 font-semibold ${isCritHop ? "text-emerald-300" : isPhaseTwo ? "text-sky-300" : "text-slate-400"}`}>
                  {method}
                </td>
                {datasets.flatMap(([dataset]) => {
                  const score = comparison[dataset]?.[sourceMethod];
                  return [
                    <td key={`${dataset}-em`} className="px-5 py-4 text-slate-300">{score?.EM == null ? "—" : score.EM.toFixed(2)}</td>,
                    <td key={`${dataset}-f1`} className="px-5 py-4 text-slate-300">{score?.F1 == null ? "—" : score.F1.toFixed(2)}</td>,
                  ];
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
