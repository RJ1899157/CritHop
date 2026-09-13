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
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur shadow-2xl">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-slate-950/70 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-5 py-4">System</th>
            <th className="px-5 py-4 text-center">HotpotQA EM</th>
            <th className="px-5 py-4 text-center">HotpotQA F1</th>
            <th className="px-5 py-4 text-center">MuSiQue EM</th>
            <th className="px-5 py-4 text-center">MuSiQue F1</th>
            <th className="px-5 py-4 text-center">2Wiki EM</th>
            <th className="px-5 py-4 text-center">2Wiki F1</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((method) => {
            const isCritHop = method.startsWith("CritHop");
            const sourceMethod =
              method === "CritHop P1"
                ? "CritHop"
                : method === "CritHop P2"
                ? "Phase 2 (reranker-slm)"
                : method;

            return (
              <tr
                key={method}
                className={`transition ${
                  isCritHop
                    ? "bg-emerald-950/40 hover:bg-emerald-950/60 border-l-4 border-l-emerald-400"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <td
                  className={`px-5 py-4 font-semibold whitespace-nowrap ${
                    isCritHop
                      ? "text-emerald-300 font-bold flex items-center gap-2"
                      : "text-slate-400"
                  }`}
                >
                  {method}
                  {method === "CritHop P2" && (
                    <span className="rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 tracking-normal uppercase">
                      adapter-slm
                    </span>
                  )}
                </td>
                {datasets.flatMap(([dataset]) => {
                  const score = comparison[dataset]?.[sourceMethod];
                  const emVal =
                    score?.EM == null ? "—" : (score.EM * (score.EM <= 1.0 && score.EM > 0 ? 100 : 1)).toFixed(2);
                  const f1Val =
                    score?.F1 == null ? "—" : (score.F1 * (score.F1 <= 1.0 && score.F1 > 0 ? 100 : 1)).toFixed(2);
                  const isPaperNum = !isCritHop;

                  return [
                    <td
                      key={`${dataset}-em`}
                      className={`px-5 py-4 text-center font-mono ${
                        isCritHop
                          ? "text-emerald-200 font-semibold"
                          : isPaperNum
                          ? "text-slate-400"
                          : "text-slate-300"
                      }`}
                    >
                      {emVal}
                    </td>,
                    <td
                      key={`${dataset}-f1`}
                      className={`px-5 py-4 text-center font-mono ${
                        isCritHop
                          ? "text-emerald-200 font-semibold"
                          : isPaperNum
                          ? "text-slate-400"
                          : "text-slate-300"
                      }`}
                    >
                      {f1Val}
                    </td>,
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
