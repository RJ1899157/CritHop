"use client";

import { FormEvent, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  queryCritHopStream,
  fetchDomainPresets,
  chunkRawText,
  type QueryResult,
  type StreamEvent,
  type GraphData,
  type DomainPreset,
} from "@/lib/api";
import { useQueryResult } from "@/context/ResultContext";

const SAMPLE_QUESTIONS: Record<string, string[]> = {
  hotpotqa: [
    "Were Scott Derrickson and Ed Wood of the same nationality?",
    "What government position was held by the woman who portrayed Corliss Archer in the film Kiss and Tell?",
    "What science fantasy young adult series, told in first person, has a set of companion books narrating the stories of enslaved worlds and alien species?",
    "Are the Laleli Mosque and Esma Sultan Mansion located in the same neighborhood?",
  ],
  musique: [
    "Who is the spouse of the Green performer?",
    "Who founded the company that distributed the film UHF?",
    "What administrative territorial entity is the owner of Ciudad Deportiva located?",
    "Where is Ulrich Walter's employer headquartered?",
    "Which company owns the manufacturer of Learjet 60?",
  ],
  "2wikimultihopqa": [
    "Who is the mother of the director of film Polish-Russian War (Film)?",
    "Which film came out first, Blind Shaft or The Mask Of Fu Manchu?",
    "When did John V, Prince Of Anhalt-Zerbst's father die?",
    "What is the award that the director of film Wearing Velvet Slippers Under A Golden Umbrella won?",
    "Where was the director of film Ronnie Rocket born?",
  ],
};

type StreamState = {
  stageMessage: string;
  graph: { nodes: number; edges: number } | null;
  graphData: GraphData | null;
  retrieval: { count: number } | null;
  hops: Array<{ hop: number; kept?: number; pruned?: number; reasoning?: string }>;
  critique: { supporting: number; isuse: boolean } | null;
  logs: string[];
};

const INITIAL_STREAM_STATE: StreamState = {
  stageMessage: "",
  graph: null,
  graphData: null,
  retrieval: null,
  hops: [],
  critique: null,
  logs: [],
};

type QueryBoxProps = {
  onResult?: (result: QueryResult) => void;
  initialQuestion?: string;
  initialDataset?: string;
};

export default function QueryBox({ onResult, initialQuestion, initialDataset }: QueryBoxProps) {
  const router = useRouter();
  const { setResult } = useQueryResult();

  const [question, setQuestion] = useState(initialQuestion || "");
  const [dataset, setDataset] = useState(initialDataset || "hotpotqa");
  const [isLoading, setIsLoading] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const [error, setError] = useState("");

  // BYOC Personal Domain & Docs State
  const [domainPresets, setDomainPresets] = useState<Record<string, DomainPreset>>({});
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [customPassages, setCustomPassages] = useState<string[]>([]);
  const [rawDocumentText, setRawDocumentText] = useState("");
  const [isChunking, setIsChunking] = useState(false);
  const [showPassageList, setShowPassageList] = useState(false);
  const [byocTab, setByocTab] = useState<"presets" | "upload">("presets");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch Domain Presets on mount
  useEffect(() => {
    fetchDomainPresets()
      .then((presets) => {
        setDomainPresets(presets);
      })
      .catch(() => {
        // Handled silently
      });
  }, []);

  useEffect(() => {
    if (initialQuestion !== undefined) {
      setQuestion(initialQuestion);
    }
  }, [initialQuestion]);

  useEffect(() => {
    if (initialDataset !== undefined) {
      setDataset(initialDataset);
      if (initialDataset === "custom" && Object.keys(domainPresets).length > 0 && customPassages.length === 0) {
        applyPreset("legal", domainPresets);
      }
    }
  }, [initialDataset, domainPresets]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlQ = params.get("question");
      const urlDs = params.get("dataset");
      const shouldAutoRun = params.get("autoRun") === "true";
      if (urlQ) setQuestion(urlQ);
      if (urlDs) {
        setDataset(urlDs);
        if (urlDs === "custom" && Object.keys(domainPresets).length > 0) {
          applyPreset("legal", domainPresets);
        }
      }
      if (shouldAutoRun && urlQ) {
        void runQuery(urlQ, urlDs || dataset);
      }
    }
  }, [domainPresets]);

  function applyPreset(presetId: string, presetsDict = domainPresets) {
    const preset = presetsDict[presetId];
    if (!preset) return;
    setSelectedPresetId(presetId);
    setQuestion(preset.question);
    setCustomPassages(preset.passages);
    setRawDocumentText(preset.passages.join("\n\n"));
    setError("");
  }

  function handleDatasetChange(newDataset: string) {
    setDataset(newDataset);
    setError("");
    if (newDataset === "custom") {
      if (!selectedPresetId || customPassages.length === 0) {
        applyPreset("legal");
      }
    } else {
      setQuestion("");
    }
  }

  async function handleAutoChunk() {
    if (!rawDocumentText.trim()) {
      setError("Please paste or type document text to chunk.");
      return;
    }
    setIsChunking(true);
    setError("");
    try {
      const chunks = await chunkRawText(rawDocumentText);
      if (chunks.length < 2) {
        setError("Could not extract at least 2 distinct passages. Try separating paragraphs with double newlines.");
      } else {
        setCustomPassages(chunks);
        setSelectedPresetId(null);
      }
    } catch {
      // Fallback local chunking by double newlines
      const fallback = rawDocumentText
        .split(/\n\s*\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (fallback.length >= 2) {
        setCustomPassages(fallback);
      } else {
        setError("Failed to chunk document automatically. Please ensure paragraphs are separated by newlines.");
      }
    } finally {
      setIsChunking(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = String(event.target?.result || "");
      setRawDocumentText(content);
      setIsChunking(true);
      setError("");
      try {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
            setCustomPassages(parsed);
            setSelectedPresetId(null);
            setIsChunking(false);
            return;
          }
        }
        const chunks = await chunkRawText(content);
        if (chunks.length >= 2) {
          setCustomPassages(chunks);
          setSelectedPresetId(null);
        } else {
          setError("Extracted fewer than 2 passages. Ensure paragraphs or bullet points are distinct.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse uploaded document.");
      } finally {
        setIsChunking(false);
      }
    };
    reader.readAsText(file);
  }

  const samples = SAMPLE_QUESTIONS[dataset] || [];

  function handleStreamEvent(ev: StreamEvent) {
    if (ev.message) {
      setStreamState((prev) => ({
        ...prev,
        stageMessage: ev.message || prev.stageMessage,
        logs: [...prev.logs.slice(-4), ev.message!],
      }));
    }

    if (ev.event === "graph_built" && ev.nodes !== undefined) {
      setStreamState((prev) => ({
        ...prev,
        graph: { nodes: ev.nodes!, edges: ev.edges || 0 },
        graphData: ev.graph_data || null,
      }));
    } else if (ev.event === "retrieval_complete" && ev.count !== undefined) {
      setStreamState((prev) => ({
        ...prev,
        retrieval: { count: ev.count! },
      }));
    } else if (ev.event === "isrel_decisions" && ev.hop !== undefined) {
      setStreamState((prev) => {
        const existingHopIdx = prev.hops.findIndex((h) => h.hop === ev.hop);
        if (existingHopIdx >= 0) {
          const updated = [...prev.hops];
          updated[existingHopIdx] = {
            ...updated[existingHopIdx],
            kept: ev.kept,
            pruned: ev.pruned,
          };
          return { ...prev, hops: updated };
        }
        return {
          ...prev,
          hops: [...prev.hops, { hop: ev.hop!, kept: ev.kept, pruned: ev.pruned }],
        };
      });
    } else if (ev.event === "hop_complete" && ev.hop !== undefined) {
      setStreamState((prev) => {
        const existingHopIdx = prev.hops.findIndex((h) => h.hop === ev.hop);
        if (existingHopIdx >= 0) {
          const updated = [...prev.hops];
          updated[existingHopIdx] = {
            ...updated[existingHopIdx],
            reasoning: ev.next_reasoning_step,
          };
          return { ...prev, hops: updated };
        }
        return {
          ...prev,
          hops: [...prev.hops, { hop: ev.hop!, reasoning: ev.next_reasoning_step }],
        };
      });
    } else if (ev.event === "critique_complete") {
      setStreamState((prev) => ({
        ...prev,
        critique: {
          supporting: ev.supporting_count ?? 0,
          isuse: Boolean(ev.isuse_score),
        },
      }));
    }
  }

  async function runQuery(targetQuestion: string, targetDataset: string) {
    setError("");

    const normalizedQuestion = targetQuestion.trim();
    if (!normalizedQuestion) {
      setError("Enter a question to continue.");
      return;
    }

    let passagesToSend = customPassages;
    if (targetDataset === "custom" && passagesToSend.length < 2) {
      let presets = domainPresets;
      if (Object.keys(presets).length === 0) {
        try {
          presets = await fetchDomainPresets();
          setDomainPresets(presets);
        } catch {
          // ignore
        }
      }
      const match = Object.values(presets).find(
        (p) => p.question.trim().toLowerCase() === normalizedQuestion.toLowerCase()
      );
      if (match) {
        passagesToSend = match.passages;
        setCustomPassages(match.passages);
        setSelectedPresetId(match.id);
        setRawDocumentText(match.passages.join("\n\n"));
      } else if (presets["legal"]) {
        passagesToSend = presets["legal"].passages;
        setCustomPassages(presets["legal"].passages);
        setSelectedPresetId("legal");
      }
    }

    if (targetDataset === "custom" && passagesToSend.length < 2) {
      setError(
        "Personal Domain & Custom Docs requires at least 2 passages to build a multi-hop knowledge graph. Please select a domain preset or auto-chunk your document."
      );
      return;
    }

    setIsLoading(true);
    setStreamState({
      ...INITIAL_STREAM_STATE,
      stageMessage: "Initiating hop-by-hop streaming pipeline...",
    });

    try {
      const result = await queryCritHopStream(
        normalizedQuestion,
        targetDataset,
        handleStreamEvent,
        targetDataset === "custom" ? passagesToSend : undefined
      );

      setResult(result);
      if (onResult) {
        onResult(result);
      } else {
        router.push("/results");
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The CritHop API could not be reached. Ensure the backend container is running on port 8000."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runQuery(question, dataset);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Dataset Selection */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-200">
            Reasoning Target & Evidence Corpus
          </label>
          <span className="text-[11px] text-slate-400">
            {dataset === "custom" ? "✨ Enterprise Scenarios & BYOC" : "📚 Benchmark Multi-Hop QA"}
          </span>
        </div>

        {/* 4 Interactive Mode Pills */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { id: "hotpotqa", label: "HotpotQA", sub: "Wikipedia 2-Hop", icon: "🏛️" },
            { id: "musique", label: "MuSiQue", sub: "Compositional 2-4 Hop", icon: "🎼" },
            { id: "2wikimultihopqa", label: "2Wiki", sub: "Entity Bridges", icon: "📚" },
            { id: "custom", label: "Custom / BYOC", sub: "Personal Docs", icon: "✨" },
          ].map((ds) => {
            const isActive = dataset === ds.id;
            return (
              <button
                key={ds.id}
                type="button"
                onClick={() => handleDatasetChange(ds.id)}
                className={`relative flex flex-col items-start rounded-2xl border p-3 text-left transition-all ${
                  isActive
                    ? ds.id === "custom"
                      ? "border-cyan-400/80 bg-cyan-950/40 text-white shadow-lg shadow-cyan-500/10"
                      : "border-emerald-400/80 bg-emerald-950/40 text-white shadow-lg shadow-emerald-500/10"
                    : "border-white/10 bg-slate-950/60 text-slate-400 hover:border-white/20 hover:bg-slate-900/60 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{ds.icon}</span>
                  <span className="text-xs font-semibold text-white">{ds.label}</span>
                </div>
                <span className="mt-1 text-[10px] text-slate-400">{ds.sub}</span>
                {isActive && (
                  <span
                    className={`absolute top-2.5 right-2.5 h-2 w-2 rounded-full ${
                      ds.id === "custom" ? "bg-cyan-400" : "bg-emerald-400"
                    } animate-pulse`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Hidden accessible select for form compatibility */}
        <select
          id="dataset"
          value={dataset}
          onChange={(event) => handleDatasetChange(event.target.value)}
          className="sr-only"
          aria-label="Corpus Dataset"
        >
          <option value="hotpotqa">HotpotQA</option>
          <option value="musique">MuSiQue</option>
          <option value="2wikimultihopqa">2WikiMultiHopQA</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {/* BYOC Personal Domain & Docs Studio Panel */}
      {dataset === "custom" && (
        <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/25 via-slate-950/80 to-black p-4 sm:p-5 shadow-2xl space-y-4">
          {/* Header & Sub-Tab Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-300 text-base">
                📂
              </span>
              <div>
                <h4 className="text-sm font-bold text-white">Personal Domain & Docs Studio</h4>
                <p className="text-[11px] text-slate-400">
                  Select a real-world enterprise scenario or import your own document
                </p>
              </div>
            </div>

            {/* Segmented View Switcher */}
            <div className="flex items-center rounded-xl border border-white/10 bg-slate-950/90 p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setByocTab("presets");
                  if (!selectedPresetId) applyPreset("legal");
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-medium transition ${
                  byocTab === "presets"
                    ? "bg-cyan-400 text-slate-950 font-semibold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>⚡ Curated Scenarios</span>
              </button>
              <button
                type="button"
                onClick={() => setByocTab("upload")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-medium transition ${
                  byocTab === "upload"
                    ? "bg-cyan-400 text-slate-950 font-semibold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>📄 Custom Doc / Paste</span>
              </button>
            </div>
          </div>

          {/* VIEW 1: CURATED REAL-WORLD SCENARIOS */}
          {byocTab === "presets" && (
            <div className="space-y-3">
              {/* 3 Interactive Scenario Cards */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {[
                  {
                    id: "legal",
                    icon: "⚖️",
                    title: "Legal M&A Liability",
                    desc: "Termination & survival cross-clauses",
                    passages: "7 Clauses · 3 Hops",
                  },
                  {
                    id: "biomedical",
                    icon: "🧬",
                    title: "Biomedical Clinical Trial",
                    desc: "HER2 blockade & renal safety",
                    passages: "6 Protocols · 3 Hops",
                  },
                  {
                    id: "tech_sre",
                    icon: "💻",
                    title: "Cloud SRE Root Cause",
                    desc: "Auth leak, Redis & 504 timeouts",
                    passages: "7 Logs · 4 Hops",
                  },
                ].map((sc) => {
                  const isSelected = selectedPresetId === sc.id;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => applyPreset(sc.id)}
                      className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all ${
                        isSelected
                          ? "border-cyan-400 bg-cyan-400/15 text-white shadow-md shadow-cyan-500/10"
                          : "border-white/10 bg-slate-950/60 text-slate-400 hover:border-cyan-400/40 hover:bg-slate-900/60 hover:text-slate-200"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xl">{sc.icon}</span>
                          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                            {sc.passages}
                          </span>
                        </div>
                        <h5 className="mt-2 text-xs font-semibold text-white group-hover:text-cyan-200 transition">
                          {sc.title}
                        </h5>
                        <p className="mt-1 text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                          {sc.desc}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="mt-2.5 flex items-center gap-1 text-[10px] font-semibold text-cyan-300">
                          <span>✓ Active Scenario</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Compact Active Knowledge Base Status Bar */}
              <div className="flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-950/30 px-3.5 py-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[11px] text-slate-400">Active Knowledge Base:</span>
                  <span className="font-semibold text-cyan-200">
                    {selectedPresetId && domainPresets[selectedPresetId]?.title}
                  </span>
                  <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
                    {customPassages.length} evidence passages
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassageList(!showPassageList)}
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-400 hover:text-cyan-300 transition underline underline-offset-4"
                >
                  {showPassageList ? "Hide Passages ▲" : "Inspect Passages ▼"}
                </button>
              </div>

              {/* Collapsible Accordion for Passages */}
              {showPassageList && customPassages.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 pt-2 border-t border-white/10">
                  {customPassages.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/5 bg-black/40 p-2.5 text-xs text-slate-300 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400">
                        <span>Evidence #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = customPassages.filter((_, i) => i !== idx);
                            setCustomPassages(updated);
                          }}
                          className="text-rose-400 hover:text-rose-300 transition"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="line-clamp-2 text-slate-400 leading-relaxed">{p}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: BRING YOUR OWN DOCUMENT / PASTE */}
          {byocTab === "upload" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="rawDoc" className="font-medium text-slate-300">
                  Paste Document Text or Drag & Drop
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-400/20 transition"
                  >
                    📁 Upload File (.txt, .md, .json)
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              </div>

              <textarea
                id="rawDoc"
                rows={3}
                value={rawDocumentText}
                onChange={(e) => setRawDocumentText(e.target.value)}
                placeholder="Paste contract terms, research notes, technical logs, or any text with paragraphs separated by double newlines..."
                className="w-full font-mono text-xs resize-y rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleAutoChunk}
                  disabled={isChunking || !rawDocumentText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-400/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/25 disabled:opacity-50"
                >
                  {isChunking ? (
                    <>
                      <svg className="h-3 w-3 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Chunking Document...
                    </>
                  ) : (
                    <>⚡ Auto-Chunk Text into Passages</>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-cyan-300">
                    {customPassages.length} passages extracted
                  </span>
                  {customPassages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPassageList(!showPassageList)}
                      className="text-xs text-slate-400 hover:text-white transition underline"
                    >
                      {showPassageList ? "Hide Passages ▲" : "Inspect Passages ▼"}
                    </button>
                  )}
                </div>
              </div>

              {showPassageList && customPassages.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 pt-2 border-t border-white/10">
                  {customPassages.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/5 bg-black/40 p-2.5 text-xs text-slate-300 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400">
                        <span>Passage #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = customPassages.filter((_, i) => i !== idx);
                            setCustomPassages(updated);
                          }}
                          className="text-rose-400 hover:text-rose-300 transition"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="line-clamp-2 text-slate-400 leading-relaxed">{p}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Multi-hop Question Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="question" className="text-sm font-medium text-slate-200">
            Multi-Hop Question
          </label>
          <span className="text-xs text-slate-400">
            {dataset === "custom" ? "Reasoning against your custom corpus" : "Context retrieved automatically"}
          </span>
        </div>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            dataset === "custom"
              ? "Ask a complex question connecting evidence across your custom document..."
              : "Ask a multi-hop question or select a sample below..."
          }
          rows={3}
          className="w-full resize-y rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20"
        />
      </div>

      {/* Benchmark Quick Samples (Hidden when Custom is selected) */}
      {dataset !== "custom" && samples.length > 0 && !isLoading && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Quick test samples:
          </p>
          <div className="flex flex-col gap-1.5">
            {samples.map((sampleQ, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setQuestion(sampleQ)}
                className="text-left text-xs text-slate-300 hover:text-emerald-300 transition rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 hover:border-emerald-400/30 hover:bg-emerald-400/5"
              >
                &ldquo;{sampleQ}&rdquo;
              </button>
            ))}
          </div>
          <div className="pt-1 text-right">
            <a
              href="/questions"
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition hover:underline"
            >
              Explore Full Question Banks →
            </a>
          </div>
        </div>
      )}

      {/* Live SSE Stream Progress Card */}
      {isLoading && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/20 p-4 shadow-inner space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Live Hop-by-Hop Stream (SSE)
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Realtime Events</span>
          </div>

          <p className="text-xs font-medium text-emerald-100">
            {streamState.stageMessage || "Executing pipeline..."}
          </p>

          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            {/* Stage 1: Graph */}
            <div
              className={`rounded-xl border p-2 ${
                streamState.graph
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.02] text-slate-400"
              }`}
            >
              <div className="font-semibold">1. Graph</div>
              <div className="mt-0.5 text-[10px]">
                {streamState.graph ? `${streamState.graph.nodes}n · ${streamState.graph.edges}e` : "Building..."}
              </div>
            </div>

            {/* Stage 2: Retrieval */}
            <div
              className={`rounded-xl border p-2 ${
                streamState.retrieval
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.02] text-slate-400"
              }`}
            >
              <div className="font-semibold">2. Retrieval</div>
              <div className="mt-0.5 text-[10px]">
                {streamState.retrieval ? `${streamState.retrieval.count} seeds ranked` : "Pending"}
              </div>
            </div>

            {/* Stage 3: Hops */}
            <div
              className={`rounded-xl border p-2 ${
                streamState.hops.length > 0
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.02] text-slate-400"
              }`}
            >
              <div className="font-semibold">3. Traversal</div>
              <div className="mt-0.5 text-[10px]">
                {streamState.hops.length > 0 ? `${streamState.hops.length} hop(s) active` : "Pending"}
              </div>
            </div>

            {/* Stage 4: Critiques */}
            <div
              className={`rounded-xl border p-2 ${
                streamState.critique
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.02] text-slate-400"
              }`}
            >
              <div className="font-semibold">4. Critiques</div>
              <div className="mt-0.5 text-[10px]">
                {streamState.critique ? `${streamState.critique.supporting} verified` : "Pending"}
              </div>
            </div>
          </div>

          {/* Hop decisions ticker */}
          {streamState.hops.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {streamState.hops.map((h) => (
                <div
                  key={h.hop}
                  className="flex items-center justify-between rounded-lg bg-black/40 px-2.5 py-1 text-[11px] text-slate-300"
                >
                  <span className="font-mono text-emerald-400">Hop {h.hop} IsREL:</span>
                  <span>
                    {h.kept !== undefined ? (
                      <>
                        <span className="text-emerald-300 font-medium">{h.kept} kept</span>
                        <span className="text-slate-500 mx-1.5">/</span>
                        <span className="text-rose-300">{h.pruned} pruned</span>
                      </>
                    ) : (
                      "Evaluating candidates..."
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-xs leading-5 text-red-200">
          <p className="font-semibold">Query Failed:</p>
          <p>{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-75 shadow-lg shadow-emerald-500/10"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin text-slate-950" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Streaming multi-hop reasoning...
          </span>
        ) : (
          "Run CritHop"
        )}
      </button>
    </form>
  );
}
