"""Dense retrieval using BGE sentence embeddings."""

from __future__ import annotations

from functools import lru_cache

import numpy as np
from sentence_transformers import SentenceTransformer


@lru_cache(maxsize=None)
def load_embedding_model(model_name: str, device: str) -> SentenceTransformer:
    """Load one shared inference model instead of one model per example."""
    return SentenceTransformer(model_name, device=device)


class BGERetriever:
    """Retrieve passages by cosine similarity in embedding space."""

    def __init__(
        self,
        passages: list[str],
        model_name: str,
        device: str = "cpu",
    ):
        self.passages = passages
        self.model = load_embedding_model(model_name, device)
        self.embeddings = self.model.encode(
            passages,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    def retrieve(self, query: str, top_k: int) -> list[tuple[int, float]]:
        """Return the top passages as ``(index, cosine_score)`` pairs."""
        if top_k <= 0 or not self.passages:
            return []

        query_embedding = self.model.encode(
            query,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        scores = np.matmul(self.embeddings, query_embedding)
        ranked_indices = sorted(
            range(len(scores)),
            key=lambda index: scores[index],
            reverse=True,
        )[:top_k]
        return [(index, float(scores[index])) for index in ranked_indices]
