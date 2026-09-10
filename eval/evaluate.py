"""Run CritHop and compare it with retrieval and paper baselines."""

from __future__ import annotations

import json
import os
from pathlib import Path

from eval.baselines import DATASET_NAMES, _load_split, _normalize_with_labels
from eval.metrics import exact_match, f1_score, ndcg_at_k
from eval.paper_numbers import PAPER_NUMBERS
from pipeline.crithop import CritHop


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _run_crithop(
    pipeline: CritHop,
    examples,
) -> dict[str, float | int]:
    em_scores = []
    f1_scores = []
    ndcg_scores = []

    for example in examples:
        question, answer, passages, labels = _normalize_with_labels(example)
        if not passages:
            continue
        result = pipeline.run(question, passages)
        prediction = result["answer"]
        selected = result["supporting_passages"]
        selected_scores = [
            1.0 / (selected.index(passage) + 1) if passage in selected else 0.0
            for passage in passages
        ]
        em_scores.append(exact_match(prediction, answer))
        f1_scores.append(f1_score(prediction, answer))
        ndcg_scores.append(ndcg_at_k(labels, selected_scores, k=10))

    return {
        "EM": _mean(em_scores),
        "F1": _mean(f1_scores),
        "NDCG@10": _mean(ndcg_scores),
        "samples": len(em_scores),
    }


def _paper_entry(method: str, dataset_name: str) -> dict:
    return PAPER_NUMBERS[method][dataset_name]


def evaluate(
    config_path: str = "pipeline/config.yaml",
    baselines_path: str = "eval/results/baselines.json",
    sample_count: int = 500,
    output_path: str = "eval/results/comparison_table.json",
) -> dict:
    """Run CritHop and save the complete comparison table."""
    with open(baselines_path, "r", encoding="utf-8") as file:
        baselines = json.load(file)

    comparison = {}
    for dataset_name in DATASET_NAMES:
        examples = list(_load_split(dataset_name).select(range(sample_count)))
        pipeline = CritHop(config_path)
        crithop_scores = _run_crithop(pipeline, examples)

        comparison[dataset_name] = {
            "BM25": baselines[dataset_name]["BM25"],
            "BGE": baselines[dataset_name]["BGE"],
            "Self-RAG": _paper_entry("Self-RAG", dataset_name),
            "HopRAG": _paper_entry("HopRAG", dataset_name),
            "CritHop": crithop_scores,
        }
        if os.getenv("USE_RERANKER", "false").lower() == "true":
            comparison[dataset_name]["Phase 2 (reranker-slm)"] = crithop_scores

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(comparison, indent=2), encoding="utf-8")
    _print_table(comparison)
    return comparison


def _print_table(comparison: dict) -> None:
    headers = [
        "Dataset",
        "BM25",
        "BGE",
        "Self-RAG",
        "HopRAG",
        "CritHop",
    ]
    if any("Phase 2 (reranker-slm)" in item for item in comparison.values()):
        headers.append("Phase 2 (reranker-slm)")
    print(" | ".join(headers))
    print(" | ".join("---" for _ in headers))
    for dataset_name, methods in comparison.items():
        values = [dataset_name]
        for method in headers[1:]:
            scores = methods.get(method, {"EM": None, "F1": None})
            em = "—" if scores["EM"] is None else f"{scores['EM']:.2f}"
            f1 = "—" if scores["F1"] is None else f"{scores['F1']:.2f}"
            ndcg = "—" if scores.get("NDCG@10") is None else f"{scores['NDCG@10']:.2f}"
            values.append(f"EM={em}, F1={f1}, NDCG@10={ndcg}")
        print(" | ".join(values))


if __name__ == "__main__":
    evaluate()
