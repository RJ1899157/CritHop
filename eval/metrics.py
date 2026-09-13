"""Answer-matching metrics for question-answering evaluation."""

from __future__ import annotations

import re
import string
from collections import Counter
import math


def normalize(text: str) -> str:
    """Normalize text: lowercase, remove punctuation, collapse whitespace, and strip articles."""
    text = str(text).lower()
    # Strip punctuation using regex
    text = re.sub(r"[^\w\s]", "", text)
    # Strip standalone articles
    text = re.sub(r"\b(a|an|the)\b", " ", text)
    # Strip leading/trailing whitespace and collapse multiple spaces into one
    return " ".join(text.split()).strip()


_normalize = normalize


def exact_match(prediction: str, ground_truth: str) -> float:
    """Return 1.0 when normalized answers match exactly or exact span matches, otherwise 0.0."""
    norm_p = normalize(prediction)
    norm_g = normalize(ground_truth)
    if not norm_p or not norm_g:
        return float(norm_p == norm_g)
    if norm_p == norm_g:
        return 1.0
    # Span match: word boundary check if concise ground truth is contained
    pattern = r"\b" + re.escape(norm_g) + r"\b"
    if re.search(pattern, norm_p):
        return 1.0
    return 0.0


def precision(prediction: str, ground_truth: str) -> float:
    """Return token-level precision against the normalized ground truth."""
    norm_p = normalize(prediction)
    norm_g = normalize(ground_truth)
    pred_tokens = norm_p.split()
    truth_tokens = norm_g.split()
    if not pred_tokens:
        return float(not truth_tokens)
    common = Counter(pred_tokens) & Counter(truth_tokens)
    return sum(common.values()) / len(pred_tokens)


def recall(prediction: str, ground_truth: str) -> float:
    """Return token-level recall against the normalized ground truth."""
    norm_p = normalize(prediction)
    norm_g = normalize(ground_truth)
    pred_tokens = norm_p.split()
    truth_tokens = norm_g.split()
    if not truth_tokens:
        return float(not pred_tokens)
    common = Counter(pred_tokens) & Counter(truth_tokens)
    return sum(common.values()) / len(truth_tokens)


def f1_score(prediction: str, ground_truth: str) -> float:
    """Return token-level F1 against the normalized ground truth using token Counter."""
    norm_p = normalize(prediction)
    norm_g = normalize(ground_truth)
    pred_tokens = norm_p.split()
    truth_tokens = norm_g.split()
    if not pred_tokens or not truth_tokens:
        return float(pred_tokens == truth_tokens)

    common = Counter(pred_tokens) & Counter(truth_tokens)
    num_same = sum(common.values())
    if num_same == 0:
        return 0.0

    predicted_precision = num_same / len(pred_tokens)
    predicted_recall = num_same / len(truth_tokens)
    if predicted_precision + predicted_recall == 0:
        return 0.0
    return (
        2
        * predicted_precision
        * predicted_recall
        / (predicted_precision + predicted_recall)
    )


def ndcg_at_k(labels: list[int], scores: list[float], k: int = 10) -> float:
    """Calculate binary-label NDCG@k for one ranked candidate list."""
    if not labels or len(labels) != len(scores) or k <= 0:
        return 0.0
    order = sorted(range(len(scores)), key=lambda index: scores[index], reverse=True)
    ranked_labels = [labels[index] for index in order[:k]]
    ideal_labels = sorted(labels, reverse=True)[:k]

    def dcg(values: list[int]) -> float:
        return sum(relevance / math.log2(position + 2) for position, relevance in enumerate(values))

    ideal_dcg = dcg(ideal_labels)
    return dcg(ranked_labels) / ideal_dcg if ideal_dcg else 0.0
