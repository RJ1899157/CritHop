import QueryBox from "@/components/QueryBox";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
      <div className="grid w-full gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <div className="mb-6 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            HopRAG × Self-RAG
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Reason across evidence, one hop at a time.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
            Ask any multi-hop question. CritHop retrieves, traverses, critiques, and answers — grounded in HotpotQA, MuSiQue, and 2WikiMultiHopQA.
          </p>
          <div className="mt-8 flex gap-3 text-sm text-slate-500">
            <span>Graph traversal</span><span>·</span><span>Evidence critique</span><span>·</span><span>Grounded answers</span>
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
          <QueryBox />
        </div>
      </div>
    </main>
  );
}
