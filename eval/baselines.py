"""Evaluate BM25 and BGE retrieval-only baselines."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml
from datasets import load_dataset

from eval.metrics import exact_match, f1_score, ndcg_at_k
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
            return [
                f"{title}: {' '.join(map(str, sentence_group))}".strip(": ")
                if isinstance(sentence_group, list)
                else f"{title}: {sentence_group}".strip(": ")
                for title, sentence_group in zip(titles, sentences)
            ]
        if isinstance(titles, list):
            return [str(item) for item in titles]
    if isinstance(context, list):
        passages = []
        for item in context:
            if isinstance(item, dict):
                title = item.get("title", "")
                text = item.get("paragraph_text", item.get("text", item.get("paragraph", "")))
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


def _normalize_with_labels(example: dict[str, Any]):
    question, answer, passages = _normalize_example(example)
    context = example.get("context", example.get("paragraphs", example.get("documents", [])))
    if isinstance(context, dict):
        supporting_titles = set(example.get("supporting_facts", {}).get("title", []))
        labels = [int(title in supporting_titles) for title in context.get("title", [])]
    elif isinstance(context, list):
        labels = [
            int(bool(item.get("is_supporting", item.get("supporting", item.get("label", False)))))
            if isinstance(item, dict) else 0
            for item in context
        ]
    else:
        labels = [0] * len(passages)
    labels = (labels + [0] * len(passages))[:len(passages)]
    return question, answer, passages, labels


def _load_split(dataset_name: str):
    local_path = Path(f"data/splits/{dataset_name}/val.jsonl")
    if local_path.exists():
        from datasets import Dataset
        with local_path.open("r", encoding="utf-8") as file:
            records = [json.loads(line) for line in file if line.strip()]
        return Dataset.from_list(records)

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
    top_k: int = 10,
    print_samples: bool = False,
):
    from eval.metrics import normalize

    scores = []
    printed = 0
    for example in examples:
        question, answer, passages, labels = _normalize_with_labels(example)
        if not passages:
            continue
        retriever = (
            retriever_cls(passages, model_name, device)
            if model_name is not None
            else retriever_cls(passages)
        )
        results = retriever.retrieve(question, top_k=len(passages))
        top_k_indices = [index for index, _ in results[:top_k]]
        top_passage = passages[results[0][0]] if results else ""
        concatenated_top_k = " ".join(passages[idx] for idx in top_k_indices)

        norm_a = normalize(answer)
        norm_top = normalize(top_passage)
        norm_concat = normalize(concatenated_top_k)

        # EM = 1.0 if ground truth is in top-1 passage
        em = 1.0 if norm_a and norm_a in norm_top else 0.0

        # F1 = token overlap between top-1 passage and answer
        truth_tokens = set(norm_a.split())
        passage_tokens = set(norm_top.split())
        common = truth_tokens & passage_tokens
        if not truth_tokens or not common:
            f1 = 0.0
        elif em == 1.0:
            f1 = 1.0
        else:
            overlap_str = " ".join(common)
            f1 = f1_score(overlap_str, answer)

        if print_samples and printed < 3:
            print(
                f"Sample {printed + 1}: (question={repr(question)}, "
                f"ground_truth={repr(answer)}, "
                f"top_passage={repr(top_passage[:80] + '...')}, "
                f"EM={em}, F1={f1})"
            )
            printed += 1

        ranked_scores = [0.0] * len(passages)
        for rank, (index, _) in enumerate(results):
            ranked_scores[index] = 1.0 / (rank + 1)
        scores.append({
            "EM": em,
            "F1": f1,
            "NDCG@10": ndcg_at_k(labels, ranked_scores, k=10),
            "top_k_has_answer": float(bool(norm_a and norm_a in norm_concat)),
        })

    count = len(scores)
    return {
        "EM": sum(item["EM"] for item in scores) / count if count else 0.0,
        "F1": sum(item["F1"] for item in scores) / count if count else 0.0,
        "NDCG@10": sum(item["NDCG@10"] for item in scores) / count if count else 0.0,
        "samples": count,
    }


def run_baselines(
    config_path: str = "pipeline/config.yaml",
    sample_count: int | None = None,
    output_path: str = "eval/results/baselines.json",
) -> dict:
    """Run BM25 and BGE on each configured evaluation dataset."""
    with open(config_path, "r", encoding="utf-8") as file:
        config = yaml.safe_load(file) or {}

    sample_count = sample_count or int(config.get("eval_samples", 50))

    results = {}
    for dataset_name in DATASET_NAMES:
        examples = list(_load_split(dataset_name).select(range(sample_count)))
        print(f"\n--- Running baselines for {dataset_name} ({len(examples)} samples) ---")
        results[dataset_name] = {
            "BM25": _evaluate_retriever(
                BM25Retriever,
                examples,
                print_samples=dataset_name == "hotpotqa",
            ),
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
