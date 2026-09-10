"""Evaluate BM25 and BGE retrieval-only baselines."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml
from datasets import load_dataset

from eval.metrics import exact_match, f1_score
from retrieval.bge_retriever import BGERetriever
from retrieval.bm25_retriever import BM25Retriever


DATASET_SPECS = {
    "hotpotqa": ("hotpotqa/hotpot_qa", "distractor"),
    "musique": ("dgslibisey/MuSiQue", None),
    "2wikimultihopqa": ("xanhho/2WikiMultihopQA", None),
}
DATASET_NAMES = DATASET_SPECS


def _first_value(example: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in example and example[key] is not None:
            return example[key]
    raise KeyError(f"Could not find any of {keys} in dataset example")


def _flatten_context(context: Any) -> list[str]:
    if isinstance(context, dict):
        titles = context.get("title", [])
        sentences = context.get("sentences", context.get("text", []))
        if isinstance(sentences, list) and sentences:
            return [" ".join(map(str, item)) if isinstance(item, list) else str(item)
                    for item in sentences]
        if isinstance(titles, list):
            return [str(item) for item in titles]
    if isinstance(context, list):
        passages = []
        for item in context:
            if isinstance(item, dict):
                title = item.get("title", "")
                text = item.get("text", item.get("paragraph", ""))
                passages.append(f"{title}: {text}".strip(": "))
            elif isinstance(item, list):
                passages.append(" ".join(map(str, item)))
            else:
                passages.append(str(item))
        return passages
    return [str(context)]


def _normalize_example(example: dict[str, Any]) -> tuple[str, str, list[str]]:
    question = str(_first_value(example, ("question", "query")))
    answer_value = _first_value(example, ("answer", "answers", "target"))
    answer = str(answer_value[0] if isinstance(answer_value, list) else answer_value)
    context = _first_value(example, ("context", "paragraphs", "documents"))
    passages = [passage for passage in _flatten_context(context) if passage.strip()]
    return question, answer, passages


def _load_split(dataset_name: str):
    dataset_id, dataset_config = DATASET_SPECS[dataset_name]
    if dataset_name == "2wikimultihopqa":
        return load_dataset(
            "parquet",
            data_files={
                "validation": (
                    "hf://datasets/xanhho/2WikiMultihopQA/dev.parquet"
                )
            },
            split="validation",
        )

    load_kwargs = {"path": dataset_id}
    if dataset_config is not None:
        load_kwargs["name"] = dataset_config
    try:
        return load_dataset(split="validation", **load_kwargs)
    except (ValueError, RuntimeError, KeyError):
        return load_dataset(split="dev", **load_kwargs)


def _evaluate_retriever(
    retriever_cls,
    examples,
    model_name: str | None = None,
    device: str = "cpu",
):
    scores = []
    for example in examples:
        question, answer, passages = _normalize_example(example)
        if not passages:
            continue
        retriever = (
            retriever_cls(passages, model_name, device)
            if model_name is not None
            else retriever_cls(passages)
        )
        results = retriever.retrieve(question, top_k=1)
        prediction = passages[results[0][0]] if results else ""
        scores.append({
            "EM": exact_match(prediction, answer),
            "F1": f1_score(prediction, answer),
        })

    count = len(scores)
    return {
        "EM": sum(item["EM"] for item in scores) / count if count else 0.0,
        "F1": sum(item["F1"] for item in scores) / count if count else 0.0,
        "samples": count,
    }


def run_baselines(
    config_path: str = "pipeline/config.yaml",
    sample_count: int = 500,
    output_path: str = "eval/results/baselines.json",
) -> dict:
    """Run BM25 and BGE on each configured evaluation dataset."""
    with open(config_path, "r", encoding="utf-8") as file:
        config = yaml.safe_load(file) or {}

    results = {}
    for dataset_name in DATASET_NAMES:
        examples = list(_load_split(dataset_name).select(range(sample_count)))
        results[dataset_name] = {
            "BM25": _evaluate_retriever(BM25Retriever, examples),
            "BGE": _evaluate_retriever(
                BGERetriever,
                examples,
                config.get("embedding_model", "BAAI/bge-base-en-v1.5"),
                config.get("embedding_device", "cpu"),
            ),
        }

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    return results


if __name__ == "__main__":
    run_baselines()
