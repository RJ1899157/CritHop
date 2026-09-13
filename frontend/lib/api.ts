export type QueryResult = {
  question: string;
  answer: string;
  hop_trace: Array<Record<string, unknown>>;
  critique_log: {
    isrel_decisions: boolean[];
    issup_decisions: boolean[];
    isuse_decision: boolean;
  };
  supporting_passages: string[];
  retrieval_retry: boolean;
};

export type ComparisonScores = {
  EM: number | null;
  F1: number | null;
  samples?: number;
};

export type ComparisonTable = Record<
  string,
  Record<string, ComparisonScores>
>;

function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname || "localhost";
    return `http://${host}:8000`;
  }
  return "http://localhost:8000";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function queryCritHop(
  question: string,
  dataset: string,
): Promise<QueryResult> {
  return request<QueryResult>("/query", {
    method: "POST",
    body: JSON.stringify({ question, dataset }),
  });
}

export function getEvaluation(): Promise<ComparisonTable> {
  return request<ComparisonTable>("/eval");
}

export function runEvaluation(): Promise<{ status: string; message: string }> {
  return request("/eval/run", { method: "POST" });
}

export function getHealth(): Promise<{
  status: string;
  model: string;
  reranker_active: boolean;
}> {
  return request("/health");
}

export type QuestionBankItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  difficulty: string;
  reasoning: string;
};

export type QuestionBankData = Record<string, QuestionBankItem[]>;

export function getQuestionBank(dataset?: string): Promise<QuestionBankData> {
  const query = dataset ? `?dataset=${encodeURIComponent(dataset)}` : "";
  return request<QuestionBankData>(`/question-bank${query}`);
}

