"""FastAPI service for the CritHop question-answering pipeline."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from pipeline.crithop import CritHop
from eval.baselines import DATASET_SPECS, _load_split, _normalize_example


CONFIG_PATH = "pipeline/config.yaml"
EVAL_PATH = Path("eval/results/comparison_table.json")
SPLITS_PATH = Path("data/splits")


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1)
    dataset: str = Field(default="hotpotqa")
    custom_passages: list[str] | None = None


class ChunkTextRequest(BaseModel):
    text: str = Field(..., min_length=1)


class EvaluationRunResponse(BaseModel):
    status: str
    message: str


_DATASET_CACHE: dict[str, list[dict]] = {}
_EXACT_QUESTION_CACHE: dict[str, dict[str, tuple[str, str, list[str]]]] = {}


def _get_dataset_records(dataset: str) -> list[dict]:
    if dataset in _DATASET_CACHE:
        return _DATASET_CACHE[dataset]
    dataset_dir = SPLITS_PATH / dataset
    if not dataset_dir.exists():
        return []
    candidates = sorted(
        path for path in dataset_dir.rglob("*")
        if path.suffix.lower() in {".json", ".jsonl"}
    )
    records: list[dict] = []
    for path in candidates:
        try:
            if path.suffix.lower() == ".jsonl":
                with path.open("r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            records.append(json.loads(line))
            else:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                recs = loaded if isinstance(loaded, list) else ((loaded.get("data") if loaded.get("data") is not None else loaded.get("records")) or [])
                records.extend(recs)
        except Exception:
            continue
    _DATASET_CACHE[dataset] = records
    return records


def _load_local_record(dataset: str, question: str) -> tuple[str, str, list[str]] | None:
    """Find a question in cached local splits with O(1) retrieval."""
    normalized_question = question.strip().casefold()
    if dataset not in _EXACT_QUESTION_CACHE:
        _EXACT_QUESTION_CACHE[dataset] = {}
    if normalized_question in _EXACT_QUESTION_CACHE[dataset]:
        return _EXACT_QUESTION_CACHE[dataset][normalized_question]

    records = _get_dataset_records(dataset)
    if not records:
        return None

    # 1. Exact match
    for record in records:
        q_text = str(record.get("question", record.get("query", ""))).strip().casefold()
        if q_text == normalized_question:
            res = _normalize_example(record)
            _EXACT_QUESTION_CACHE[dataset][normalized_question] = res
            return res

    # 2. Substring or token overlap match
    q_tokens = set(normalized_question.split())
    best_record = None
    best_overlap = 0
    for record in records:
        q_text = str(record.get("question", record.get("query", ""))).strip().casefold()
        if not q_text:
            continue
        if normalized_question in q_text or q_text in normalized_question:
            res = _normalize_example(record)
            _EXACT_QUESTION_CACHE[dataset][normalized_question] = res
            return res
        rec_tokens = set(q_text.split())
        overlap = len(q_tokens & rec_tokens)
        if overlap > best_overlap and overlap >= 3:
            best_overlap = overlap
            best_record = record

    if best_record is not None:
        res = _normalize_example(best_record)
        _EXACT_QUESTION_CACHE[dataset][normalized_question] = res
        return res

    # 3. Fallback: if query is arbitrary, retrieve top passages via BM25 across pre-indexed records
    all_passages = []
    for r in records[:500]:
        _, _, p = _normalize_example(r)
        all_passages.extend(p)
    if all_passages:
        from retrieval.bm25_retriever import BM25Retriever
        bm25 = BM25Retriever(all_passages)
        top_results = bm25.retrieve(question, top_k=10)
        retrieved_passages = [all_passages[idx] for idx, _ in top_results]
        if retrieved_passages:
            res = (question, "", retrieved_passages)
            _EXACT_QUESTION_CACHE[dataset][normalized_question] = res
            return res

    return None


DOMAIN_PRESETS = {
    "legal": {
        "id": "legal",
        "domain": "Legal Discovery & Contracts",
        "title": "M&A Cross-Contract Liability & Confidentiality Breach",
        "icon": "⚖️",
        "description": "Multi-hop cross-referencing between Master Services Agreement, Section clauses, Non-Disclosure terms, and SLA exclusions.",
        "question": "Does Supplier's confidentiality obligation survive agreement termination if Customer terminates under Section 12.2?",
        "passages": [
            "Master Services Agreement (Section 12.2 - Termination for Cause): Either party may terminate this Agreement immediately upon written notice if the other party materially breaches any provision of this Agreement and fails to cure such breach within thirty (30) days.",
            "Master Services Agreement (Section 12.5 - Survival): The provisions of Section 8 (Confidentiality), Section 11 (Indemnification), and Section 14 (Limitation of Liability) shall survive any termination or expiration of this Agreement.",
            "Master Services Agreement (Section 8.1 - Confidential Information): Each party agrees that all code, inventions, business, technical, and financial information disclosed to it by the other party constitutes Confidential Information.",
            "Master Services Agreement (Section 8.3 - Duration of Confidentiality): Non-disclosure obligations regarding Confidential Information shall endure for a period of five (5) years following termination or expiration of this Agreement, except that Trade Secrets shall remain protected indefinitely.",
            "Non-Disclosure Agreement (Section 3 - Exclusions): Confidential Information does not include information that is or becomes publicly known through no breach of receiving party, or was already in receiving party's possession prior to disclosure.",
            "Data Processing Addendum (Section 4 - Security): Supplier shall maintain ISO 27001 compliance and notify Customer within 24 hours of any verified security incident affecting Personal Data.",
            "Schedule B (Service Level Agreement): Supplier guarantees 99.9% monthly service uptime. Failure to meet uptime warrants service credits under Section 4.2 but does not constitute a material breach under Section 12.2.",
        ],
    },
    "biomedical": {
        "id": "biomedical",
        "domain": "Biomedical & Clinical Trials",
        "title": "HER2 Receptor Blockade & Downstream Signaling Inhibition",
        "icon": "🧬",
        "description": "Multi-hop reasoning linking monoclonal antibody binding mechanisms to downstream kinase cascades and clinical cohort safety metrics.",
        "question": "Does targeting the HER2 receptor in Patient Cohort A inhibit the downstream MAPK pathway while preserving renal clearance?",
        "passages": [
            "Trastuzumab Mechanism of Action: Trastuzumab is a recombinant humanized monoclonal antibody that selectively binds to the extracellular domain IV of the human epidermal growth factor receptor 2 (HER2), inhibiting ligand-independent HER2 homodimerization and downstream kinase cascades.",
            "MAPK Signaling Cascade in HER2+ Tumors: Dimerization of HER2 leads to rapid phosphorylation of intrinsic tyrosine residues, which directly activates the Ras-Raf-MEK-ERK (MAPK) mitogenic pathway, driving oncogenic cellular proliferation.",
            "Clinical Trial Protocol NCT-048912 (Cohort A): Cohort A enrolled 140 adult patients with metastatic HER2-overexpressing breast carcinoma receiving dual HER2-targeted therapy with trastuzumab and pertuzumab.",
            "Cohort A Biomarker & Renal Telemetry: Pharmacodynamic biopsy assays of Cohort A demonstrated 86% inhibition of downstream phosphorylated ERK/MAPK. Serum creatinine and estimated glomerular filtration rate (eGFR) remained unchanged across all 12 evaluation cycles, demonstrating preserved renal clearance.",
            "EGFR Monoclonal Antibodies and Nephrotoxicity: Unlike HER2-specific agents, pan-ErbB inhibitors targeting EGFR directly can disrupt renal distal tubular magnesium transport, causing severe hypomagnesemia and nephrotoxic decline.",
            "Secondary Resistance Pathway PI3K/Akt: Approximately 30% of HER2+ malignancies develop secondary therapeutic resistance via hyperactivating mutations in the PIK3CA gene, bypassing upstream MAPK blockade.",
        ],
    },
    "tech_sre": {
        "id": "tech_sre",
        "domain": "Cloud Architecture & Tech SRE Incident",
        "title": "Distributed Auth-Service Outage & Cascading Gateway Failure",
        "icon": "💻",
        "description": "Multi-hop root cause analysis linking a JVM heap memory leak in auth-service to Redis socket exhaustion and 504 Gateway Timeouts.",
        "question": "Did the memory leak in auth-service cause the Redis connection drops and 504 Gateway Timeouts on payments-service?",
        "passages": [
            "Incident Report INC-8821 (Executive Summary): On October 14 at 14:22 UTC, the checkout service experienced a spike in HTTP 504 Gateway Timeouts affecting 42% of customer transactions.",
            "auth-service Deployment Log: At 14:05 UTC, commit `f92a1` was deployed to auth-service. The change introduced unclosed gRPC telemetry channels, causing a linear JVM heap memory leak of 120MB per minute.",
            "Kubernetes OOMKilled Telemetry: At 14:18 UTC, Pod memory on all 6 auth-service replicas exceeded the 2Gi cgroup ceiling, triggering continuous OOMKill restart loops every 45 seconds.",
            "Redis Shared Connection Pool: All active microservices authenticate tokens via an embedded Redis Cluster (node-cluster-prod-01). Continuous crashing and reconnecting by auth-service flooded Redis with 45,000 TCP SYN/ACK handshake retries per second, exhausting the file descriptor limit and dropping active client connections.",
            "payments-service Dependency Architecture: The payments-service requires synchronous JWT token verification via Redis on port 6379 before dispatching payment authorization requests to Stripe.",
            "Root Cause Conclusion: Because Redis rejected new socket connections due to auth-service connection exhaustion, payments-service threads blocked awaiting JWT verification until the 15-second client timeout tripped, emitting 504 Gateway Timeouts to the frontend.",
            "CDN Edge Routing Configuration: Cloudflare edge ingress proxies route `/api/v1/checkout` requests directly to payments-service with a strict upstream timeout of 15 seconds.",
        ],
    },
}


def _find_context(
    dataset: str,
    question: str,
    custom_passages: list[str] | None = None,
) -> tuple[str, str, list[str]]:
    if dataset == "custom" or custom_passages is not None:
        passages = [p.strip() for p in (custom_passages or []) if p.strip()]
        if len(passages) < 2:
            q_clean = question.strip().casefold()
            for preset in DOMAIN_PRESETS.values():
                if preset["question"].strip().casefold() == q_clean:
                    passages = preset["passages"]
                    break
        if len(passages) < 2:
            raise HTTPException(
                status_code=400,
                detail="Custom domain query requires at least 2 passages to construct a multi-hop knowledge graph.",
            )
        return question, "", passages

    if dataset not in DATASET_SPECS:
        raise HTTPException(status_code=400, detail=f"Unknown dataset: {dataset}")

    local_record = _load_local_record(dataset, question)
    if local_record is not None:
        return local_record

    try:
        split = _load_split(dataset)
        for record in split:
            normalized = _normalize_example(record)
            if normalized[0].strip().casefold() == question.strip().casefold():
                return normalized
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not load the {dataset} dataset split: {exc}") from exc

    raise HTTPException(status_code=404, detail="Question not found in the selected dataset split.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.crithop = CritHop(CONFIG_PATH)
    try:
        from retrieval.bge_retriever import load_embedding_model
        load_embedding_model(
            app.state.crithop.config.get("embedding_model", "BAAI/bge-base-en-v1.5"),
            app.state.crithop.config.get("embedding_device", "cpu"),
        )
        if getattr(app.state.crithop, "reranker", None):
            app.state.crithop.reranker._scores("warmup", ["warmup passage"], batch_size=1)
        for ds in ("hotpotqa", "musique", "2wikimultihopqa"):
            recs = _get_dataset_records(ds)
            # Pre-index exact questions from records for fast O(1) lookup
            if ds not in _EXACT_QUESTION_CACHE:
                _EXACT_QUESTION_CACHE[ds] = {}
            for r in recs:
                q = str(r.get("question", r.get("query", ""))).strip().casefold()
                if q and q not in _EXACT_QUESTION_CACHE[ds]:
                    try:
                        _EXACT_QUESTION_CACHE[ds][q] = _normalize_example(r)
                    except Exception:
                        pass
    except Exception:
        pass
    yield


app = FastAPI(title="CritHop API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


QUESTION_BANK = {
    "hotpotqa": [
        {
            "id": "hotpotqa-1",
            "question": "Were Scott Derrickson and Ed Wood of the same nationality?",
            "answer": "yes",
            "category": "Comparison Reasoning",
            "difficulty": "2 Hops",
            "reasoning": "Identify nationality of Scott Derrickson (American) and Ed Wood (American), then verify equivalence."
        },
        {
            "id": "hotpotqa-2",
            "question": "What government position was held by the woman who portrayed Corliss Archer in the film Kiss and Tell?",
            "answer": "Chief of Protocol",
            "category": "Bridge Entity",
            "difficulty": "2 Hops",
            "reasoning": "Identify actress who portrayed Corliss Archer (Shirley Temple), then retrieve her diplomatic position."
        },
        {
            "id": "hotpotqa-3",
            "question": "What science fantasy young adult series, told in first person, has a set of companion books narrating the stories of enslaved worlds and alien species?",
            "answer": "Animorphs",
            "category": "Bridge Property",
            "difficulty": "2 Hops",
            "reasoning": "Identify the YA sci-fi series with alien companion chronicles (Animorphs)."
        },
        {
            "id": "hotpotqa-4",
            "question": "Are the Laleli Mosque and Esma Sultan Mansion located in the same neighborhood?",
            "answer": "no",
            "category": "Spatial Comparison",
            "difficulty": "2 Hops",
            "reasoning": "Locate Laleli Mosque (Fatih) and Esma Sultan Mansion (Ortaköy), then verify neighborhoods differ."
        },
        {
            "id": "hotpotqa-5",
            "question": "The director of the romantic comedy \"Big Stone Gap\" is based in what New York city?",
            "answer": "Greenwich Village, New York City",
            "category": "Compositional",
            "difficulty": "2 Hops",
            "reasoning": "Find director of 'Big Stone Gap' (Adriana Trigiani), then retrieve her New York residence."
        },
    ],
    "musique": [
        {
            "id": "musique-1",
            "question": "Who is the spouse of the Green performer?",
            "answer": "Miquette Giraudy",
            "category": "Compositional",
            "difficulty": "2 Hops",
            "reasoning": "Find the artist behind album Green (Steve Hillage), then find his spouse."
        },
        {
            "id": "musique-2",
            "question": "Who founded the company that distributed the film UHF?",
            "answer": "Mike Medavoy",
            "category": "Multi-hop Founder",
            "difficulty": "3 Hops",
            "reasoning": "Find distributor of UHF (Orion Pictures), then find who founded Orion Pictures."
        },
        {
            "id": "musique-3",
            "question": "What administrative territorial entity is the owner of Ciudad Deportiva located?",
            "answer": "Tamaulipas",
            "category": "Geographical",
            "difficulty": "2 Hops",
            "reasoning": "Locate Ciudad Deportiva's owning municipality, then determine its state/territory."
        },
        {
            "id": "musique-4",
            "question": "Where is Ulrich Walter's employer headquartered?",
            "answer": "Cologne",
            "category": "Bridge Entity",
            "difficulty": "2 Hops",
            "reasoning": "Identify Ulrich Walter's employer (German Aerospace Center DLR), then find its headquarters."
        },
        {
            "id": "musique-5",
            "question": "Which company owns the manufacturer of Learjet 60?",
            "answer": "Bombardier Inc.",
            "category": "Hierarchical Ownership",
            "difficulty": "2 Hops",
            "reasoning": "Find manufacturer of Learjet 60 (Learjet), then identify its parent corporation."
        },
        {
            "id": "musique-6",
            "question": "Who is the child of Caroline LeRoy's spouse?",
            "answer": "Fletcher Webster",
            "category": "Genealogical Bridge",
            "difficulty": "2 Hops",
            "reasoning": "Determine Caroline LeRoy's spouse (Daniel Webster), then identify their child."
        },
    ],
    "2wikimultihopqa": [
        {
            "id": "2wiki-1",
            "question": "Who is the mother of the director of film Polish-Russian War (Film)?",
            "answer": "Małgorzata Braunek",
            "category": "Bridge Entity",
            "difficulty": "2 Hops",
            "reasoning": "Identify director of Polish-Russian War (Xawery Żuławski), then retrieve his mother."
        },
        {
            "id": "2wiki-2",
            "question": "Which film came out first, Blind Shaft or The Mask Of Fu Manchu?",
            "answer": "The Mask Of Fu Manchu",
            "category": "Temporal Comparison",
            "difficulty": "2 Hops",
            "reasoning": "Retrieve release dates of Blind Shaft (2003) and The Mask Of Fu Manchu (1932), compare."
        },
        {
            "id": "2wiki-3",
            "question": "When did John V, Prince Of Anhalt-Zerbst's father die?",
            "answer": "12 June 1516",
            "category": "Temporal Bridge",
            "difficulty": "2 Hops",
            "reasoning": "Identify father of John V (Ernest I, Prince of Anhalt-Dessau), then retrieve death date."
        },
        {
            "id": "2wiki-4",
            "question": "What is the award that the director of film Wearing Velvet Slippers Under A Golden Umbrella won?",
            "answer": "Myanmar Motion Picture Academy Awards",
            "category": "Compositional",
            "difficulty": "2 Hops",
            "reasoning": "Find director of the film, then look up their major national motion picture award."
        },
        {
            "id": "2wiki-5",
            "question": "Where was the director of film Ronnie Rocket born?",
            "answer": "Missoula, Montana",
            "category": "Geographical Bridge",
            "difficulty": "2 Hops",
            "reasoning": "Identify director of Ronnie Rocket (David Lynch), then find his birthplace."
        },
        {
            "id": "2wiki-6",
            "question": "Are North Marion High School (Oregon) and Seoul High School both located in the same country?",
            "answer": "no",
            "category": "Spatial Comparison",
            "difficulty": "2 Hops",
            "reasoning": "Identify countries (USA vs South Korea), then compare."
        },
    ],
    "custom": [
        {
            "id": "custom-legal",
            "question": DOMAIN_PRESETS["legal"]["question"],
            "answer": "Yes, Section 12.5 specifies that Section 8 (Confidentiality) survives any termination, and Section 8.3 requires confidentiality to endure for five (5) years.",
            "category": "Legal Discovery",
            "difficulty": "3 Hops",
            "reasoning": "Traverse Section 12.2 (Termination for Cause) -> Section 12.5 (Survival terms) -> Section 8 (Confidentiality duration).",
        },
        {
            "id": "custom-biomedical",
            "question": DOMAIN_PRESETS["biomedical"]["question"],
            "answer": "Yes, biopsy assays showed 86% inhibition of downstream phosphorylated ERK/MAPK, while serum creatinine and eGFR remained unchanged across all 12 cycles.",
            "category": "Biomedical Trials",
            "difficulty": "3 Hops",
            "reasoning": "Traverse Trastuzumab HER2 binding mechanism -> MAPK pathway activation -> Cohort A biopsy inhibition and renal telemetry.",
        },
        {
            "id": "custom-sre",
            "question": DOMAIN_PRESETS["tech_sre"]["question"],
            "answer": "Yes, auth-service's memory leak caused continuous OOMKill restart loops that flooded Redis with 45k handshake retries, exhausting file descriptors and blocking payments-service token verifications.",
            "category": "Tech SRE Root Cause",
            "difficulty": "4 Hops",
            "reasoning": "Traverse auth-service JVM leak -> OOMKill loop -> Redis connection flood & exhaustion -> payments-service JWT blocking & 504 timeouts.",
        },
    ],
}


@app.get("/question-bank")
def get_question_bank(dataset: str | None = None) -> dict:
    """Return categorized multi-hop question banks across all supported benchmark datasets."""
    if dataset:
        ds_lower = dataset.lower()
        if ds_lower not in QUESTION_BANK:
            raise HTTPException(status_code=400, detail=f"Unknown dataset: {dataset}")
        return {ds_lower: QUESTION_BANK[ds_lower]}
    return QUESTION_BANK


@app.get("/samples/{dataset}")
def get_sample_questions(dataset: str) -> list[str]:
    """Return sample questions from pre-indexed dataset split for quick testing."""
    ds_lower = dataset.lower()
    if ds_lower in QUESTION_BANK:
        return [item["question"] for item in QUESTION_BANK[ds_lower]]

    dataset_dir = SPLITS_PATH / dataset
    samples = []
    if dataset_dir.exists():
        for path in dataset_dir.rglob("*.jsonl"):
            try:
                for line in path.read_text(encoding="utf-8").splitlines():
                    if line.strip():
                        rec = json.loads(line)
                        q = rec.get("question", rec.get("query"))
                        if q and q not in samples:
                            samples.append(q)
                        if len(samples) >= 5:
                            return samples
            except Exception:
                pass
    return samples or [
        "Were Scott Derrickson and Ed Wood of the same nationality?",
        "What government position was held by the woman who portrayed Corliss Archer in the film Kiss and Tell?",
        "What science fantasy young adult series, told in first person, has a set of companion books narrating the stories of enslaved worlds and alien species?",
    ]


def _chunk_raw_text(raw_text: str, target_chunk_size: int = 400) -> list[str]:
    """Split raw text into clean semantic passages for knowledge graph construction."""
    cleaned = raw_text.strip()
    if not cleaned:
        return []

    # 1. Split by double newline if paragraphs exist
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", cleaned) if p.strip()]
    if len(paragraphs) >= 2:
        return paragraphs

    # 2. Split by single newlines if lines are substantial
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    if len(lines) >= 3 and all(len(line) > 30 for line in lines):
        return lines

    # 3. Fallback: group sentences into chunk size
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    chunks = []
    curr: list[str] = []
    curr_len = 0
    for s in sentences:
        curr.append(s)
        curr_len += len(s)
        if curr_len >= target_chunk_size:
            chunks.append(" ".join(curr))
            curr = []
            curr_len = 0
    if curr:
        chunks.append(" ".join(curr))

    return chunks if len(chunks) >= 2 else [cleaned]


@app.get("/domain-presets")
def get_domain_presets() -> dict:
    """Return curated multi-hop enterprise scenario presets (Legal, Biomedical, Tech SRE)."""
    return DOMAIN_PRESETS


@app.post("/chunk-text")
def chunk_text(request: ChunkTextRequest) -> dict:
    """Split user-uploaded or pasted document text into semantic passages for BYOC exploration."""
    passages = _chunk_raw_text(request.text)
    return {"passages": passages, "count": len(passages)}


@app.post("/query")
def query(request: QueryRequest, http_request: Request) -> dict:
    """Resolve dataset or custom context server-side, then run CritHop."""
    _, _, passages = _find_context(request.dataset, request.question, request.custom_passages)
    return http_request.app.state.crithop.run(
        request.question,
        passages,
    )


@app.post("/query/stream")
def query_stream(request: QueryRequest, http_request: Request):
    """Stream CritHop pipeline stages and progressive hop-by-hop updates via SSE."""
    _, _, passages = _find_context(request.dataset, request.question, request.custom_passages)

    def event_generator():
        for ev in http_request.app.state.crithop.run_stream(request.question, passages):
            event_type = ev.get("event", "message")
            yield f"event: {event_type}\ndata: {json.dumps(ev)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/eval")
def evaluation() -> dict:
    """Return the saved evaluation comparison table."""
    if not EVAL_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="Evaluation results not found. Run eval/evaluate.py first.",
        )
    return json.loads(EVAL_PATH.read_text(encoding="utf-8"))


@app.post("/eval/run", response_model=EvaluationRunResponse)
def run_evaluation() -> EvaluationRunResponse:
    """Run the configured evaluation and refresh the saved comparison table."""
    try:
        subprocess.Popen(
            [sys.executable, "-m", "eval.evaluate"],
            cwd=Path.cwd(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not start evaluation: {exc}") from exc
    return EvaluationRunResponse(status="started", message="Evaluation started. Refresh shortly for updated results.")


@app.get("/health")
def health(request: Request) -> dict:
    """Return service and model status."""
    crithop = getattr(request.app.state, "crithop", None)
    if crithop and hasattr(crithop, "config"):
        model = crithop.config.get("model", "openai/gpt-oss-120b")
    else:
        with open(CONFIG_PATH, "r", encoding="utf-8") as file:
            config = yaml.safe_load(file) or {}
        model = config.get("model", "openai/gpt-oss-120b")
    return {
        "status": "ok",
        "model": model,
        "reranker_active": os.getenv("USE_RERANKER", "false").lower() == "true",
    }
