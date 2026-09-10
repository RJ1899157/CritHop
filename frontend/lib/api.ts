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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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
  passages: string[],
): Promise<QueryResult> {
  return request<QueryResult>("/query", {
    method: "POST",
    body: JSON.stringify({ question, passages }),
  });
}

export function getEvaluation(): Promise<ComparisonTable> {
  return request<ComparisonTable>("/eval");
}

export function getHealth(): Promise<{
  status: string;
  model: string;
  reranker_active: boolean;
}> {
  return request("/health");
}
