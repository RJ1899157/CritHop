"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { queryCritHop } from "@/lib/api";

export default function QueryBox() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [dataset, setDataset] = useState("hotpotqa");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      setError("Enter a question to continue.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await queryCritHop(normalizedQuestion, dataset);
      sessionStorage.setItem("crithop-result", JSON.stringify(result));
      router.push("/results");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The CritHop API could not be reached.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="question" className="text-sm font-medium text-slate-200">
          Question
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a multi-hop question..."
          className="min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="dataset" className="text-sm font-medium text-slate-200">Dataset</label>
        <select id="dataset" value={dataset} onChange={(event) => setDataset(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20">
          <option value="hotpotqa">HotpotQA</option>
          <option value="musique">MuSiQue</option>
          <option value="2wikimultihopqa">2WikiMultiHopQA</option>
        </select>
      </div>

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Traversing evidence..." : "Run CritHop"}
      </button>
    </form>
  );
}
