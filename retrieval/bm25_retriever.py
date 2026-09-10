"""BM25 lexical retrieval over a collection of passages."""

from __future__ import annotations

import re

from rank_bm25 import BM25Okapi


class BM25Retriever:
    """Retrieve passages using token-based BM25 scoring."""

    def __init__(self, passages: list[str]):
        self.passages = passages
        tokenized_passages = [self._tokenize(passage) for passage in passages]
        self.bm25 = BM25Okapi(tokenized_passages)

    def retrieve(self, query: str, top_k: int) -> list[tuple[int, float]]:
        """Return the top passages as ``(index, score)`` pairs."""
        if top_k <= 0 or not self.passages:
            return []

        scores = self.bm25.get_scores(self._tokenize(query))
        ranked_indices = sorted(
            range(len(scores)),
            key=lambda index: scores[index],
            reverse=True,
        )[:top_k]
        return [(index, float(scores[index])) for index in ranked_indices]

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return re.findall(r"\b\w+\b", text.lower())
