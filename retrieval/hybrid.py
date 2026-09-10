"""Reciprocal Rank Fusion for BM25 and dense retrieval."""

from __future__ import annotations

from retrieval.bge_retriever import BGERetriever
from retrieval.bm25_retriever import BM25Retriever


class HybridRetriever:
    """Fuse BM25 and BGE rankings without comparing raw score scales."""

    def __init__(self, bm25: BM25Retriever, bge: BGERetriever):
        self.bm25 = bm25
        self.bge = bge

    def retrieve(self, query: str, top_k: int) -> list[tuple[int, float]]:
        """Return passages ranked by Reciprocal Rank Fusion."""
        if top_k <= 0:
            return []

        rrf_scores: dict[int, float] = {}
        for ranked_results in (
            self.bm25.retrieve(query, top_k),
            self.bge.retrieve(query, top_k),
        ):
            for rank, (passage_idx, _) in enumerate(ranked_results, start=1):
                rrf_scores[passage_idx] = rrf_scores.get(passage_idx, 0.0) + (
                    1.0 / (60 + rank)
                )

        ranked_indices = sorted(
            rrf_scores,
            key=lambda index: (-rrf_scores[index], index),
        )[:top_k]
        return [(index, float(rrf_scores[index])) for index in ranked_indices]
