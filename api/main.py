"""FastAPI service for the CritHop question-answering pipeline."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pipeline.crithop import CritHop
from eval.baselines import DATASET_SPECS, _load_split, _normalize_example


CONFIG_PATH = "pipeline/config.yaml"
EVAL_PATH = Path("eval/results/comparison_table.json")
SPLITS_PATH = Path("data/splits")


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1)
    dataset: str = Field(..., min_length=1)


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


def _find_context(dataset: str, question: str) -> tuple[str, str, list[str]]:
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


@app.post("/query")
def query(request: QueryRequest, http_request: Request) -> dict:
    """Resolve dataset context server-side, then run CritHop."""
    _, _, passages = _find_context(request.dataset, request.question)
    return http_request.app.state.crithop.run(
        request.question,
        passages,
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
