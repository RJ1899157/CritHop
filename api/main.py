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


def _load_local_record(dataset: str, question: str) -> tuple[str, str, list[str]] | None:
    """Find a question in a local JSON/JSONL split, if one is available."""
    dataset_dir = SPLITS_PATH / dataset
    if not dataset_dir.exists():
        return None

    candidates = sorted(
        path for path in dataset_dir.rglob("*")
        if path.suffix.lower() in {".json", ".jsonl"}
    )
    normalized_question = question.strip().casefold()
    for path in candidates:
        try:
            if path.suffix.lower() == ".jsonl":
                records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
            else:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                records = loaded if isinstance(loaded, list) else loaded.get("data", loaded.get("records", []))
            for record in records:
                if str(record.get("question", record.get("query", ""))).strip().casefold() == normalized_question:
                    return _normalize_example(record)
        except (OSError, json.JSONDecodeError, AttributeError, KeyError, TypeError):
            continue
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
    yield


app = FastAPI(title="CritHop API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
def health() -> dict:
    """Return service and model status."""
    with open(CONFIG_PATH, "r", encoding="utf-8") as file:
        config = yaml.safe_load(file) or {}
    return {
        "status": "ok",
        "model": config.get("model"),
        "reranker_active": os.getenv("USE_RERANKER", "false").lower() == "true",
    }
