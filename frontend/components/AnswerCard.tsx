type AnswerCardProps = {
  answer: string;
  supportingPassages: string[];
};

export default function AnswerCard({
  answer,
  supportingPassages,
}: AnswerCardProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
            Final answer
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Grounded response</h2>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
          CritHop
        </span>
      </div>

      <p className="text-lg leading-8 text-slate-100">{answer}</p>

      <div className="mt-8 border-t border-white/10 pt-5">
        <h3 className="text-sm font-semibold text-slate-200">
          Supporting passages
        </h3>
        <div className="mt-3 space-y-3">
          {supportingPassages.length > 0 ? (
            supportingPassages.map((passage, index) => (
              <blockquote
                key={`${passage}-${index}`}
                className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-300"
              >
                <span className="mr-2 font-mono text-xs text-emerald-300">
                  [{index + 1}]
                </span>
                {passage}
              </blockquote>
            ))
          ) : (
            <p className="text-sm text-slate-500">No supporting passages returned.</p>
          )}
        </div>
      </div>
    </section>
  );
}
