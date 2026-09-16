"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getQuestionBank, type QuestionBankData, type QuestionBankItem } from "@/lib/api";

type QuestionBankProps = {
  onSelectQuestion?: (question: string, dataset: string) => void;
  selectedDataset?: string;
};

const DATASET_LABELS: Record<string, { name: string; tag: string; desc: string }> = {
  hotpotqa: {
    name: "HotpotQA",
    tag: "Distractor Setting",
    desc: "Challenging 2-hop comparison and bridge questions over Wikipedia articles with 8 distractor paragraphs.",
  },
  musique: {
    name: "MuSiQue",
    tag: "Multi-hop Composition",
    desc: "Hard 2-to-4 hop compositional reasoning designed to prevent single-hop shortcuts and entity leaks.",
  },
  "2wikimultihopqa": {
    name: "2WikiMultiHopQA",
    tag: "Structured Evidence",
    desc: "Entity-relation multi-hop reasoning requiring explicit cross-passage entity and temporal bridges.",
  },
  custom: {
    name: "Enterprise & BYOC",
    tag: "Real-World Scenarios",
    desc: "Real-world multi-hop investigations across legal contracts, biomedical clinical trials, and cloud SRE incidents.",
  },
};

export default function QuestionBank({ onSelectQuestion, selectedDataset }: QuestionBankProps) {
  const router = useRouter();
  const [bank, setBank] = useState<QuestionBankData | null>(null);
  const [activeDataset, setActiveDataset] = useState(selectedDataset || "hotpotqa");
  const [searchFilter, setSearchFilter] = useState("");
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      try {
        const data = await getQuestionBank();
        setBank(data);
      } catch (err) {
        console.error("Failed to load question bank", err);
      }
    }
    void load();

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const ds = params.get("dataset");
      if (ds) {
        setActiveDataset(ds);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedDataset && selectedDataset !== activeDataset) {
      setActiveDataset(selectedDataset);
    }
  }, [selectedDataset]);

  const questions = (bank?.[activeDataset] || []) as QuestionBankItem[];
  const filteredQuestions = questions.filter((q) =>
    searchFilter
      ? q.question.toLowerCase().includes(searchFilter.toLowerCase()) ||
        q.category.toLowerCase().includes(searchFilter.toLowerCase()) ||
        q.reasoning.toLowerCase().includes(searchFilter.toLowerCase())
      : true
  );

  function toggleAnswer(id: string) {
    setRevealedAnswers((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleSelect(item: QuestionBankItem) {
    if (onSelectQuestion) {
      onSelectQuestion(item.question, activeDataset);
    } else {
      router.push(`/?question=${encodeURIComponent(item.question)}&dataset=${activeDataset}&autoRun=true`);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur shadow-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Benchmark Question Bank
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">Curated Multi-Hop Question Bank</h3>
          <p className="mt-1 text-xs text-slate-400">
            Select any question to test CritHop evidence graph traversal, SLM critique, and grounded answering.
          </p>
        </div>

        <input
          type="text"
          placeholder="Filter questions or reasoning..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-emerald-400/50"
        />
      </div>

      {/* Dataset Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4 mb-6">
        {Object.entries(DATASET_LABELS).map(([key, info]) => {
          const isActive = activeDataset === key;
          const count = bank?.[key]?.length ?? 0;
          return (
            <button
              key={key}
              onClick={() => setActiveDataset(key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition ${
                isActive
                  ? "bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/20"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{info.name}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  isActive ? "bg-slate-950/20 text-slate-950 font-bold" : "bg-white/10 text-slate-300"
                }`}
              >
                {count || "6"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 rounded-xl border border-white/5 bg-slate-950/50 p-3 text-xs text-slate-400">
        <span className="font-semibold text-emerald-300">{DATASET_LABELS[activeDataset]?.name}</span>
        <span className="mx-2">·</span>
        <span>{DATASET_LABELS[activeDataset]?.desc}</span>
      </div>

      {/* Question Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
        {filteredQuestions.map((item) => {
          const isRevealed = Boolean(revealedAnswers[item.id]);
          return (
            <div
              key={item.id}
              className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4 transition hover:border-emerald-400/40 hover:bg-slate-900/80"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                    {item.category}
                  </span>
                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                    {item.difficulty}
                  </span>
                </div>

                <h4 className="mt-3 text-sm font-medium text-white group-hover:text-emerald-200 transition">
                  {item.question}
                </h4>

                <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  <span className="text-slate-500 font-semibold">Reasoning: </span>
                  {item.reasoning}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => toggleAnswer(item.id)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition underline underline-offset-4"
                >
                  {isRevealed ? `Target: "${item.answer}"` : "Reveal Target Answer"}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400 hover:text-slate-950 transition"
                >
                  <span>Run Query</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
