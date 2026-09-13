type CritiquePanelProps = {
  isrelDecisions: boolean[];
  issupDecisions: boolean[];
  isuseDecision: boolean;
};

function DecisionBadge({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
      <span className="font-mono text-xs font-semibold tracking-widest text-slate-300">
        [{label}]
      </span>
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          value
            ? "bg-emerald-400/15 text-emerald-300"
            : "bg-red-400/15 text-red-300"
        }`}
      >
        {value ? "YES" : "NO"}
      </span>
    </div>
  );
}

export default function CritiquePanel({
  isrelDecisions = [],
  issupDecisions = [],
  isuseDecision = false,
}: CritiquePanelProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
        Critique signals
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">Self-reflection</h2>
      <div className="mt-5 space-y-3">
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Relevance checks</p>
          {isrelDecisions.length > 0 ? isrelDecisions.map((value, index) => <DecisionBadge key={`rel-${index}`} label={`IsREL ${index + 1}`} value={value} />) : <DecisionBadge label="IsREL" value={false} />}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Support checks</p>
          {issupDecisions.length > 0 ? issupDecisions.map((value, index) => <DecisionBadge key={`sup-${index}`} label={`IsSUP ${index + 1}`} value={value} />) : <DecisionBadge label="IsSUP" value={false} />}
        </div>
        <DecisionBadge label="IsUSE" value={isuseDecision} />
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        {isrelDecisions.length} relevance checks · {issupDecisions.length} support checks
      </p>
    </section>
  );
}
