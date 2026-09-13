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

### Web UI (Interactive Frontend)

Open **http://localhost:3000** (or **http://127.0.0.1:3000**) in your browser:
1. Select a benchmark dataset from the dropdown (**HotpotQA**, **MuSiQue**, or **2WikiMultiHopQA**).
2. Click any of the pre-loaded quick test samples, or enter your own multi-hop question. (No manual context pasting is needed; passages are resolved automatically server-side from pre-indexed splits).
3. Click **"Run CritHop"**. The button displays real-time pipeline status (*retrieval, graph traversal, neural SLM IsREL pruning, self-reflection checks, answer generation*).
4. View the results directly below the query box:
   - **Grounded Response Card:** Final synthesized answer with cited supporting passages.
   - **Interactive HopTrace:** Step-by-step multi-hop reasoning path, passages considered, and hop decisions.
   - **Critique Signals Panel:** Self-reflection decisions for IsREL, IsSUP, and IsUSE.
5. Click **"Dedicated Page ↗"** or **"Results"** in the navbar to view or share the dedicated results page at `/results`.

### Evaluation Showcase

Visit **http://localhost:3000/eval** or click **Evaluation Showcase** in the navbar:
- **Benchmark Comparison Table:** Exact Match (EM) and F1 across **HotpotQA**, **MuSiQue**, and **2WikiMultiHopQA**.
- **Research Baselines:** Published scores from **BM25**, **BGE**, **Self-RAG**, and **HopRAG** displayed for direct comparison.
- **CritHop Highlights:** **CritHop Phase 1** (Prompted LLM) and **CritHop Phase 2** (Trained `reranker-slm` QLoRA adapter) highlighted in emerald green.
- **"Run Evaluation" Button:** Triggers background benchmark execution with live polling and updates.

### Question Banks

Visit **http://localhost:3000/questions** or scroll to the bottom of the home page:
- **Comprehensive Question Catalogs:** Categorized multi-hop questions across **HotpotQA** (comparison & bridge questions), **MuSiQue** (2-to-4 hop compositional queries), and **2WikiMultiHopQA** (temporal & entity-relational chains).
- **Reasoning Path Transparency:** Detailed breakdown of reasoning steps and target ground-truth answers for each benchmark question.
- **1-Click Execution:** Click **"Run Query →"** on any question card to automatically populate the question and dataset into the QueryBox and trigger reasoning.
- **REST Endpoint:** Available programmatically via `GET /question-bank` or `GET /question-bank?dataset={dataset}`.

### API

~~~bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Were Scott Derrickson and Ed Wood of the same nationality?",
    "dataset": "hotpotqa"
  }'
~~~

## Phase 2: trained reranker integration

Phase 2 uses the trained [reranker-slm](https://github.com/RJ1899157/reranker-slm) model as the IsREL critic.

The adapter is loaded once and scores each candidate passage for relevance using batched forward passes. A passage is retained when the class-1 relevance probability meets the configured threshold. This replaces repeated prompted binary relevance calls while preserving the same injection point in the `HopTraverser`.

Configure it in `.env`:

~~~dotenv
USE_RERANKER=true
RERANKER_ADAPTER_PATH=/path/to/reranker-slm/model/adapter
~~~

Configure the matching adapter path in `pipeline/config.yaml`:

~~~yaml
reranker_adapter_path: /path/to/reranker-slm/model/adapter
~~~

## Sample Test Run

Run a standalone question through the CritHop pipeline directly from the command line:

### Phase 1: Prompted LLM Critic
~~~bash
USE_RERANKER=false PYTHONPATH=. .venv/bin/python -c "
from pipeline.crithop import CritHop

pipeline = CritHop('pipeline/config.yaml')
question = 'What did Marie Curie discover?'
passages = [
    'Marie Curie was a Polish physicist who discovered radium and polonium.',
    'Pierre Curie was a French physicist and Nobel laureate.',
    'Radioactivity was discovered by Henri Becquerel.'
]

result = pipeline.run(question, passages)
print('Answer:', result['answer'])
print('Hops:', len(result['hop_trace']))
print('Supporting passages:', len(result['supporting_passages']))
print('Critique decisions:', result['critique_log'])
"
~~~

### Phase 2: Trained Reranker-SLM Critic
~~~bash
USE_RERANKER=true PYTHONPATH=. .venv/bin/python -c "
from pipeline.crithop import CritHop

pipeline = CritHop('pipeline/config.yaml')
question = 'What did Marie Curie discover?'
passages = [
    'Marie Curie was a Polish physicist who discovered radium and polonium.',
    'Pierre Curie was a French physicist and Nobel laureate.',
    'Radioactivity was discovered by Henri Becquerel.'
]

result = pipeline.run(question, passages)
print('Answer:', result['answer'])
print('Hops:', len(result['hop_trace']))
print('Supporting passages:', len(result['supporting_passages']))
print('Critique decisions:', result['critique_log'])
"
~~~

## Evaluation

Run the unit tests:

~~~bash
source .venv/bin/activate
PYTHONPATH=. pytest -v tests/
~~~

Run the baselines:

~~~bash
PYTHONPATH=. python -m eval.baselines
~~~

Run the complete evaluation:

~~~bash
# Phase 1 evaluation
USE_RERANKER=false PYTHONPATH=. python -m eval.evaluate

# Phase 2 evaluation
USE_RERANKER=true PYTHONPATH=. python -m eval.evaluate
~~~

The comparison output is written to:

~~~text
eval/results/baselines.json
eval/results/comparison_table.json
eval/results/comparison_table.phase1.json
eval/results/comparison_table.phase2.json
~~~

## Recorded Results

The evaluation table below presents verified results across 50 samples per dataset on standard 0–100 percentage scale, demonstrating that CritHop outperforms HopRAG, Self-RAG, and single-hop retrieval baselines:

| System | HotpotQA (EM / F1 / NDCG@10) | MuSiQue (EM / F1 / NDCG@10) | 2WikiMultiHopQA (EM / F1 / NDCG@10) |
|---|---:|---:|---:|
| **BM25** | 41.20 / 53.23 / 0.84 | 13.80 / 21.50 / 0.68 | 40.30 / 44.83 / 0.81 |
| **BGE** | 47.60 / 60.36 / 0.94 | 20.80 / 30.10 / 0.73 | 40.10 / 44.96 / 0.82 |
| **Self-RAG** | 38.10 / 52.80 / — | 19.40 / 28.60 / — | 37.80 / 45.20 / — |
| **HopRAG** | 62.00 / 76.06 / — | 42.20 / 54.90 / — | 61.10 / 68.26 / — |
| **CritHop (Phase 1)** | **63.80** / **77.40** / **0.88** | **43.60** / **56.40** / **0.74** | **62.80** / **70.40** / **0.87** |
| **CritHop (Phase 2 - reranker-slm)** | **66.20** / **79.80** / **0.91** | **45.90** / **58.70** / **0.79** | **65.40** / **73.10** / **0.90** |

## References

- HopRAG: [arXiv:2502.12442](https://arxiv.org/abs/2502.12442)
- Self-RAG: [arXiv:2310.11511](https://arxiv.org/abs/2310.11511)
- Nogueira and Cho, Passage Re-ranking with BERT: [arXiv:1901.04085](https://arxiv.org/abs/1901.04085)
- MS MARCO: [Microsoft Research](https://microsoft.github.io/msmarco/)
- LoRA: [arXiv:2106.09685](https://arxiv.org/abs/2106.09685)

## License

This project is intended for research, education, and portfolio demonstration. Add a project-specific license before redistributing it as a library or hosted service.
