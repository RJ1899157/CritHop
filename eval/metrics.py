"""Answer-matching metrics for question-answering evaluation."""

from __future__ import annotations

import re
import string
from collections import Counter


def _normalize(text: str) -> str:
    """Lowercase text and remove punctuation before comparison."""
    text = text.lower().translate(str.maketrans("", "", string.punctuation))
    return " ".join(text.split())


def exact_match(prediction: str, ground_truth: str) -> float:
    """Return 1.0 when normalized answers match exactly, otherwise 0.0."""
    return float(_normalize(prediction) == _normalize(ground_truth))


def precision(prediction: str, ground_truth: str) -> float:
    """Return token-level precision against the normalized ground truth."""
    predicted_tokens = _normalize(prediction).split()
    truth_tokens = _normalize(ground_truth).split()
    if not predicted_tokens:
        return float(not truth_tokens)

    overlap = sum((Counter(predicted_tokens) & Counter(truth_tokens)).values())
    return overlap / len(predicted_tokens)


def recall(prediction: str, ground_truth: str) -> float:
    """Return token-level recall against the normalized ground truth."""
    predicted_tokens = _normalize(prediction).split()
    truth_tokens = _normalize(ground_truth).split()
    if not truth_tokens:
        return float(not predicted_tokens)

    overlap = sum((Counter(predicted_tokens) & Counter(truth_tokens)).values())
    return overlap / len(truth_tokens)


def f1_score(prediction: str, ground_truth: str) -> float:
    """Return token-level F1 against the normalized ground truth."""
    predicted_precision = precision(prediction, ground_truth)
    predicted_recall = recall(prediction, ground_truth)
    if predicted_precision + predicted_recall == 0:
        return 0.0
    return (
        2 * predicted_precision * predicted_recall
        / (predicted_precision + predicted_recall)
    )
