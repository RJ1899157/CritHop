"""FastAPI service for the CritHop question-answering pipeline."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pipeline.crithop import CritHop


CONFIG_PATH = "pipeline/config.yaml"
EVAL_PATH = Path("eval/results/comparison_table.json")


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1)
    passages: list[str] = Field(..., min_length=1)


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
    """Run CritHop for a question and supplied context passages."""
    return http_request.app.state.crithop.run(
        request.question,
        request.passages,
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
