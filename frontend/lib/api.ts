export type GraphNode = {
  id: number;
  title: string;
  snippet: string;
  text: string;
  status?: "candidate" | "kept" | "pruned" | "supporting";
  hop?: number;
};

export type GraphEdge = {
  source: number;
  target: number;
  weight?: number;
  isTraversal?: boolean;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type QueryResult = {
  question: string;
  answer: string;
  hop_trace: Array<Record<string, unknown>>;
  graph?: GraphData;
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
    const protocol = window.location.protocol || "http:";
    const host = window.location.hostname || "localhost";
    return `${protocol}//${host}:8000`;
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

export type StreamEvent = {
  event: string;
  stage?: string;
  message?: string;
  nodes?: number;
  edges?: number;
  count?: number;
  top_passages?: number[];
  hop?: number;
  candidates_count?: number;
  kept?: number;
  pruned?: number;
  selected_count?: number;
  next_node?: number | null;
  next_reasoning_step?: string;
  surviving_count?: number;
  issup_scores?: boolean[];
  isuse_score?: boolean;
  supporting_count?: number;
  graph_data?: GraphData;
  result?: QueryResult;
};

export function queryCritHop(
  question: string,
  dataset: string,
): Promise<QueryResult> {
  return request<QueryResult>("/query", {
    method: "POST",
    body: JSON.stringify({ question, dataset }),
  });
}

export async function queryCritHopStream(
  question: string,
  dataset: string,
  onEvent: (event: StreamEvent) => void,
): Promise<QueryResult> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/query/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, dataset }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("ReadableStream not supported in this environment.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalResult: QueryResult | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (!part.trim()) continue;
        const lines = part.split("\n");
        let eventType = "message";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.replace(/^event:\s*/, "").trim();
          } else if (line.startsWith("data:")) {
            dataStr += line.replace(/^data:\s*/, "");
          }
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr) as StreamEvent;
            parsed.event = eventType || parsed.event;
            onEvent(parsed);
            if (parsed.event === "complete" && parsed.result) {
              finalResult = parsed.result;
            } else if (parsed.event === "error") {
              throw new Error(parsed.message || "Streaming pipeline error");
            }
          } catch (err) {
            if (err instanceof Error && err.message !== "Unexpected end of JSON input") {
              if (dataStr.includes('"event":"error"')) {
                throw err;
              }
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalResult) {
    throw new Error("Stream closed before receiving complete pipeline result.");
  }

  return finalResult;
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

