# CritHop

CritHop is a multi-hop question-answering system that combines HopRAG-style graph traversal with Self-RAG-style relevance, support, and usefulness critique.

## Architecture

```text
                         User question + passages
                                  |
                                  v
                 +---------------------------------------+
                 | BM25 + BGE hybrid retrieval           |
                 +---------------------------------------+
                                  |
                                  v
                 +---------------------------------------+
                 | Semantic PassageGraph                 |
                 +---------------------------------------+
                                  |
                                  v
                 +---------------------------------------+
                 | HopTraverser                          |
                 |                                       |
                 | [IsREL] Injection Point 1             |
                 |   Phase 1: prompted Groq critic       |
                 |   Phase 2: reranker-slm locally        |
                 +---------------------------------------+
                                  |
                                  v
                 +---------------------------------------+
                 | Next-hop reasoning with Groq           |
                 +---------------------------------------+
                                  |
                                  v
                 +---------------------------------------+
                 | Generator                             |
                 |                                       |
                 | [IsSUP] Injection Point 2             |
                 |   filter passages supporting draft    |
                 |                                       |
                 | grounded answer generation            |
                 |                                       |
                 | [IsUSE] Injection Point 3             |
                 |   validate final answer; retry once   |
                 +---------------------------------------+
                                  |
                                  v
                 answer + supporting passages + HopTrace
```

## Novel contribution

HopRAG contributes logic-aware passage traversal, while Self-RAG contributes reflection signals for retrieval and generation. CritHop combines both ideas into one inspectable pipeline:

1. A semantic passage graph exposes multi-hop neighborhoods instead of treating retrieval as a flat ranking problem.
2. IsREL filters candidate neighbors at every traversal hop.
3. IsSUP checks whether selected evidence directly supports the generated answer.
4. IsUSE checks whether the final answer is useful and complete, with one bounded recovery attempt.
5. HopTrace and the critique log make every retrieval and reflection decision observable.
6. Phase 2 replaces the expensive prompted IsREL call with the trained reranker-slm cross-encoder.

## Results

The published HopRAG values below come from its GPT-4o, top-20-passage Table 2 setting. CritHop values below are the completed 50-sample local run recorded in `eval/results/comparison_table.json`; baselines used 500 samples, so this is a smoke-scale comparison rather than a matched benchmark.

| Method | HotpotQA EM / F1 | MuSiQue EM / F1 | 2WikiMultiHopQA EM / F1 | NDCG@10 |
|---|---:|---:|---:|---:|
| BM25 (HopRAG Table 2) | 41.20 / 53.23 | 13.80 / 21.50 | 40.30 / 44.83 | generated locally |
| BGE (HopRAG Table 2) | 47.60 / 60.36 | 20.80 / 30.10 | 40.10 / 44.96 | generated locally |
| Self-RAG | not reported in this setting | not reported | not reported | not reported |
| HopRAG | 62.00 / 76.06 | 42.20 / 54.90 | 61.10 / 68.26 | not reported |
| CritHop observed run | 2.00 / 24.40 | 2.00 / 11.01 | 10.00 / 27.75 | 0.820 / 0.599 / 0.000 |
| CritHop Phase 2 (reranker-slm), recorded datasets | not recorded | 2.00 / 11.01 | 10.00 / 27.75 | 0.599 / 0.000 |

The Phase 1-versus-Phase 2 delta is not claimed here because a matched Phase 1 and Phase 2 run was not recorded for every dataset. Run both modes with the same sample count before reporting that delta.

## Setup

### Local Python backend

```zsh
cd /Users/rishabhjain/Desktop/CritHop
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Set `GROQ_API_KEY` in `.env`. Use `USE_RERANKER=false` for Phase 1. For Phase 2, set it to `true` and set `RERANKER_ADAPTER_PATH` to the trained adapter directory.

### Local frontend

```zsh
cd frontend
npm install
npm run dev
```

### Docker Compose

From the project root:

```zsh
docker compose up --build
```

The backend is available at `http://localhost:8000` and the frontend at `http://localhost:3000`. Set `RERANKER_SLM_PATH` if the sibling `reranker-slm` directory is in a different location.

## Running a query

Open the UI at `http://localhost:3000`, enter a question, paste passages separated by blank lines, and select **Run CritHop**.

The equivalent API request is:

```zsh
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What nationality was the physicist who conducted pioneering research on radioactivity?",
    "passages": [
      "Marie Curie was a Polish and naturalized-French physicist.",
      "Marie Curie conducted pioneering research on radioactivity.",
      "Radioactivity has applications in medical imaging and cancer treatment."
    ]
  }'
```

Health check:

```zsh
curl http://localhost:8000/health
```

## Phase 2: reranker-slm at IsREL

The trained Qwen2.5-0.5B-Instruct LoRA classifier from `reranker-slm` replaces prompted Groq IsREL calls. It loads the adapter and classification head once, scores each candidate passage locally, and accepts a passage when class-1 probability is at least `isrel_threshold`.

```text
USE_RERANKER=false  -> Phase 1: prompted Groq IsREL
USE_RERANKER=true   -> Phase 2: local reranker-slm IsREL
```

Run the Phase 2 smoke test first, then the evaluation:

```zsh
python -m pytest -q tests
python -m eval.baselines
python -m eval.evaluate
```

The evaluation writes `eval/results/baselines.json` and `eval/results/comparison_table.json`. The Phase 2 delta is the difference between the Phase 1 and Phase 2 EM/F1/NDCG@10 values produced under matched settings; do not substitute the reranker-slm standalone benchmark values because those use a different candidate set.

## References

- [HopRAG: Multi-Hop Reasoning for Logic-Aware Retrieval-Augmented Generation](https://arxiv.org/abs/2502.12442)
- [Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection](https://arxiv.org/abs/2310.11511)
- [Passage Re-ranking with BERT — Nogueira and Cho](https://arxiv.org/abs/1901.04085)
- [MS MARCO: A Human Generated MAchine Reading COmprehension Dataset](https://arxiv.org/abs/1611.09268)
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)
