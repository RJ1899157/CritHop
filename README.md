# CritHop

## Critique-driven multi-hop question answering

CritHop is a research-oriented multi-hop QA system that combines HopRAG-style passage-graph traversal with Self-RAG-style reflection. It retrieves evidence, follows connected reasoning paths, critiques relevance and support, and generates answers grounded in the surviving passages.

> **Phase 2 integration:** CritHop can replace prompted relevance judging with the trained [reranker-slm](https://github.com/RJ1899157/reranker-slm) adapter at the IsREL gate.

## Why CritHop?

CritHop adds a critique layer to graph-based multi-hop retrieval:

- **Graph traversal:** passages become nodes and semantically similar passages become edges, enabling evidence chains across hops.
- **Three reflection gates:** IsREL filters passages during traversal, IsSUP verifies answer support, and IsUSE checks answer completeness.
- **Hybrid retrieval:** BM25 lexical retrieval and BGE dense retrieval are fused with reciprocal rank fusion.
- **Phase 2 reranking:** the trained reranker-slm model can replace prompted IsREL decisions.
- **Observability:** hop traces and critique decisions are returned with every answer.
- **Reproducible deployment:** the backend, frontend, and local Ollama model run together through Docker Compose.

## Architecture

~~~text
                              User question
                                   |
                                   v
                    +-----------------------------+
                    | HybridRetriever             |
                    | BM25 + BGE + RRF            |
                    +-----------------------------+
                                   |
                                   v
                    +-----------------------------+
                    | PassageGraph                |
                    | nodes = passages            |
                    | edges = BGE similarity      |
                    +-----------------------------+
                                   |
                                   v
                    +-----------------------------+
                    | HopTraverser                |
                    | multi-hop reasoning         |
                    +-----------------------------+
                                   |
                    +--------------+--------------+
                    |                             |
                    v                             v
        [IsREL - Injection Point 1]       Hop reasoning LLM
        prompted critic or Phase 2        selects next hop
        reranker-slm replacement
                    |                             |
                    +--------------+--------------+
                                   |
                                   v
                    +-----------------------------+
                    | Generator                   |
                    | grounded answer synthesis   |
                    +-----------------------------+
                                   |
                    v                             v
        [IsSUP - Injection Point 2]       [IsUSE - Injection Point 3]
        verifies passage support          verifies usefulness/completeness
                                   |                             |
                                   +--------------+--------------+
                                                  |
                                                  v
                              Answer + evidence + HopTrace
~~~

## Technology stack

| Layer | Technology |
|---|---|
| API | [FastAPI](https://fastapi.tiangolo.com/), [Pydantic](https://docs.pydantic.dev/) |
| Language model runtime | [Ollama](https://ollama.com/) locally, with Groq-compatible support |
| Default local model | qwen2.5:3b |
| Retrieval | [rank_bm25](https://github.com/dorianbrown/rank_bm25), [Sentence Transformers](https://www.sbert.net/), BAAI BGE |
| Generation and critique | LLaMA-compatible chat interface with cached provider calls |
| Phase 2 relevance model | [reranker-slm](https://github.com/RJ1899157/reranker-slm), Qwen2.5-0.5B + LoRA |
| Frontend | [Next.js](https://nextjs.org/), TypeScript, [Tailwind CSS](https://tailwindcss.com/), shadcn/ui |
| Evaluation | Exact Match, token F1, precision, recall, NDCG@10 |
| Packaging | Docker Compose |

## Repository layout

~~~text
CritHop/
├── api/                 FastAPI endpoints
├── critique/            IsREL, IsSUP, and IsUSE critics
├── eval/                metrics, baselines, and comparison results
├── frontend/            Next.js user interface
├── generation/          grounded answer generation
├── graph/               passage graph construction and traversal
├── pipeline/            CritHop orchestration and configuration
├── retrieval/           BM25, BGE, and hybrid retrieval
├── reranker/            Phase 2 reranker adapter integration
├── tests/               unit and integration tests
├── utils/               provider clients and shared utilities
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
~~~

## Quick start with Docker

Docker is the recommended way to run the complete application.

~~~bash
git clone https://github.com/RJ1899157/CritHop.git
cd CritHop

cp .env.example .env
# Edit .env if you want to use Groq instead of the local Ollama provider.

docker compose up --build
~~~

The first startup downloads the local qwen2.5:3b model into the Docker volume. After the services are ready:

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health
- Ollama: http://localhost:11434

Stop the stack with:

~~~bash
docker compose down
~~~

## Run a query

### Web UI

Open http://localhost:3000, enter a question and passages, then submit. The results page displays the generated answer, supporting passages, critique decisions, and hop trace.

### API

~~~bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Which city hosted the event attended by the author of the paper?",
    "passages": [
      "The author attended an event in Paris.",
      "The paper was written by Alex Morgan.",
      "The event took place in Paris in 2024."
    ]
  }'
~~~

## Phase 2: trained reranker integration

Phase 2 uses the trained [reranker-slm](https://github.com/RJ1899157/reranker-slm) model as the IsREL critic.

The adapter is loaded once and scores each candidate passage for relevance. A passage is retained when the class-1 relevance probability meets the configured threshold. This replaces repeated prompted binary relevance calls while preserving the same injection point in the HopTraverser.

Configure it in .env:

~~~dotenv
USE_RERANKER=true
RERANKER_SLM_PATH=/path/to/reranker-slm/model/adapter
~~~

Configure the matching adapter path in pipeline/config.yaml:

~~~yaml
reranker_adapter_path: /path/to/reranker-slm/model/adapter
~~~

The Phase 2 result is the change in retrieval and answer quality between the prompted IsREL critic and the trained reranker. Compare EM, F1, and NDCG@10 in the generated evaluation table.

## Evaluation

Run the tests:

~~~bash
source .venv/bin/activate
python -m pytest -q
~~~

Run the evaluation:

~~~bash
python -m eval.baselines
python -m eval.evaluate
~~~

The comparison output is written to:

~~~text
eval/results/baselines.json
eval/results/comparison_table.json
~~~

The evaluation uses a capped sample count from pipeline/config.yaml to control runtime and local-model resource usage. For a fair paper comparison, use matched dataset splits and sample counts.

## Recorded results

The repository contains the following recorded smoke-scale results. Published paper values are included for context; CritHop's local run used a smaller sample count and should not be interpreted as a directly matched benchmark.

| System | HotpotQA EM / F1 | MuSiQue EM / F1 | 2WikiMultiHopQA EM / F1 |
|---|---:|---:|---:|
| BM25 | 41.20 / 53.23 | 13.80 / 21.50 | 40.30 / 44.83 |
| BGE | 47.60 / 60.36 | 20.80 / 30.10 | 40.10 / 44.96 |
| Self-RAG | Not reported in HopRAG Table 2 | Not reported | Not reported |
| HopRAG | 62.00 / 76.06 | 42.20 / 54.90 | 61.10 / 68.26 |
| CritHop Phase 1 | 2.00 / 24.40 | 2.00 / 11.01 | 10.00 / 27.75 |
| CritHop Phase 2 | Run with USE_RERANKER=true | Run with USE_RERANKER=true | Run with USE_RERANKER=true |

## References

- HopRAG: [arXiv:2502.12442](https://arxiv.org/abs/2502.12442)
- Self-RAG: [arXiv:2310.11511](https://arxiv.org/abs/2310.11511)
- Nogueira and Cho, Passage Re-ranking with BERT: [arXiv:1901.04085](https://arxiv.org/abs/1901.04085)
- MS MARCO: [Microsoft Research](https://microsoft.github.io/msmarco/)
- LoRA: [arXiv:2106.09685](https://arxiv.org/abs/2106.09685)

## License

This project is intended for research, education, and portfolio demonstration. Add a project-specific license before redistributing it as a library or hosted service.
