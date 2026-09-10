type HopTraceProps = {
  hopTrace: Array<Record<string, unknown>>;
};

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(" · ");
  }
  return String(value ?? "—");
}

export default function HopTrace({ hopTrace }: HopTraceProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
        Reasoning path
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">HopTrace</h2>
      <div className="mt-6 space-y-0">
        {hopTrace.length === 0 ? (
          <p className="text-sm text-slate-500">No hop trace was returned.</p>
        ) : (
          hopTrace.map((hop, index) => (
            <div key={`${String(hop.hop ?? index)}-${index}`} className="relative pl-9 pb-7 last:pb-0">
              <div className="absolute left-2 top-1 h-full w-px bg-violet-400/25 last:hidden" />
              <div className="absolute left-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-violet-400 text-[10px] font-bold text-slate-950">
                {index + 1}
              </div>
              <p className="text-sm font-semibold text-violet-200">
                Hop {String(hop.hop ?? index + 1)}
              </p>
              <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                <p><span className="text-slate-200">Passages considered:</span> {formatValue(hop.passages_considered)}</p>
                <p><span className="text-slate-200">IsREL decisions:</span> {formatValue(hop.isrel_decisions)}</p>
                <p><span className="text-slate-200">Reasoning step:</span> {String(hop.llm_reasoning_step ?? hop.reasoning_step ?? "—")}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
