"""Run CritHop and compare it with retrieval and paper baselines."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Callable

import yaml

from eval.baselines import DATASET_NAMES, _load_split, _normalize_with_labels
from eval.metrics import exact_match, f1_score, ndcg_at_k
from eval.paper_numbers import PAPER_NUMBERS
from pipeline.crithop import CritHop


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _run_crithop(
    pipeline: CritHop,
    examples,
    groq_rpm_buffer: float = 0.5,
    on_example: Callable[[dict[str, float | int]], None] | None = None,
) -> dict[str, float | int]:
    em_scores = []
    f1_scores = []
    ndcg_scores = []

    for example in examples:
        question, answer, passages, labels = _normalize_with_labels(example)
        if not passages:
            if on_example is not None:
                on_example({"EM": 0.0, "F1": 0.0, "NDCG@10": 0.0, "samples": 0})
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
        if on_example is not None:
            on_example({
                "EM": em_scores[-1],
                "F1": f1_scores[-1],
                "NDCG@10": ndcg_scores[-1],
                "samples": 1,
            })
        time.sleep(groq_rpm_buffer)

    return {
        "EM": _mean(em_scores),
        "F1": _mean(f1_scores),
        "NDCG@10": _mean(ndcg_scores),
        "samples": len(em_scores),
    }


def _write_json_atomic(path: Path, value: dict) -> None:
    """Persist a complete JSON document without leaving a partial checkpoint."""
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(value, indent=2), encoding="utf-8")
    temporary.replace(path)


def _paper_entry(method: str, dataset_name: str) -> dict:
    return PAPER_NUMBERS[method][dataset_name]


def _merge_scores(
    previous: dict[str, float | int] | None,
    current: dict[str, float | int],
) -> dict[str, float | int]:
    previous = previous or {"EM": 0.0, "F1": 0.0, "NDCG@10": 0.0, "samples": 0}
    old_count = int(previous["samples"])
    new_count = int(current["samples"])
    total = old_count + new_count
    if not total:
        return dict(previous)
    return {
        metric: (
            (float(previous[metric]) * old_count + float(current[metric]) * new_count)
            / total
        )
        for metric in ("EM", "F1", "NDCG@10")
    } | {"samples": total}


def evaluate(
    config_path: str = "pipeline/config.yaml",
    baselines_path: str = "eval/results/baselines.json",
    sample_count: int | None = None,
    output_path: str = "eval/results/comparison_table.json",
) -> dict:
    """Run CritHop and save the complete comparison table."""
    with open(baselines_path, "r", encoding="utf-8") as file:
        baselines = json.load(file)

    comparison = {}
    output = Path(output_path)
    progress_path = output.with_suffix(".progress.json")
    if output.exists():
        comparison = json.loads(output.read_text(encoding="utf-8"))
    progress = (
        json.loads(progress_path.read_text(encoding="utf-8"))
        if progress_path.exists()
        else {}
    )

    with open(config_path, "r", encoding="utf-8") as file:
        config = yaml.safe_load(file) or {}
    sample_count = sample_count or int(config.get("eval_samples", 50))
    groq_rpm_buffer = float(config.get("groq_rpm_buffer", 0.5))

    for dataset_name in DATASET_NAMES:
        if dataset_name in comparison:
            continue
        examples = list(_load_split(dataset_name).select(range(sample_count)))
        dataset_progress = progress.get(dataset_name, {})
        processed = int(dataset_progress.get("processed", 0))
        crithop_scores = dataset_progress.get("scores")
        for start in range(processed, sample_count, 10):
            batch = examples[start:start + 10]
            pipeline = CritHop(config_path)

            def save_example(example_scores: dict[str, float | int]) -> None:
                nonlocal crithop_scores, processed
                crithop_scores = _merge_scores(crithop_scores, example_scores)
                processed += 1
                progress[dataset_name] = {
                    "processed": processed,
                    "scores": crithop_scores,
                }
                progress_path.parent.mkdir(parents=True, exist_ok=True)
                _write_json_atomic(progress_path, progress)

            _run_crithop(
                pipeline,
                batch,
                groq_rpm_buffer=groq_rpm_buffer,
                on_example=save_example,
            )

        comparison[dataset_name] = {
            "BM25": baselines[dataset_name]["BM25"],
            "BGE": baselines[dataset_name]["BGE"],
            "Self-RAG": _paper_entry("Self-RAG", dataset_name),
            "HopRAG": _paper_entry("HopRAG", dataset_name),
            "CritHop": crithop_scores,
        }
        if os.getenv("USE_RERANKER", "false").lower() == "true":
            comparison[dataset_name]["Phase 2 (reranker-slm)"] = crithop_scores
        output.parent.mkdir(parents=True, exist_ok=True)
        _write_json_atomic(output, comparison)

    output.parent.mkdir(parents=True, exist_ok=True)
    _write_json_atomic(output, comparison)
    if len(comparison) == len(DATASET_NAMES) and progress_path.exists():
        progress_path.unlink()
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
