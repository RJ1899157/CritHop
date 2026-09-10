"""Build a semantic passage graph for multi-hop retrieval."""

from __future__ import annotations

from typing import Any

import numpy as np

from retrieval.bge_retriever import load_embedding_model


class PassageGraph:
    """Represent passages as nodes connected by semantic similarity."""

    def __init__(self, passages: list[str], config: dict):
        self.passages = passages
        self.config = config
        self.threshold = float(config.get("graph_similarity_threshold", 0.5))
        model_name = config.get(
            "embedding_model", "BAAI/bge-base-en-v1.5"
        )
        self.model = load_embedding_model(
            model_name,
            config.get("embedding_device", "cpu"),
        )
        self.graph: dict[str, Any] = {"nodes": {}, "adjacency": {}}

    def build(self) -> dict:
        """Create graph nodes and connect pairs above the similarity threshold."""
        if not self.passages:
            self.graph = {"nodes": {}, "adjacency": {}}
            return self.graph

        embeddings = self.model.encode(
            self.passages,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

        nodes = {
            idx: {
                "text": passage,
                "index": idx,
                "embedding": embedding,
            }
            for idx, (passage, embedding) in enumerate(
                zip(self.passages, embeddings)
            )
        }
        adjacency = {idx: [] for idx in range(len(self.passages))}

        similarities = np.matmul(embeddings, embeddings.T)
        for left_idx in range(len(self.passages)):
            for right_idx in range(left_idx + 1, len(self.passages)):
                if similarities[left_idx, right_idx] >= self.threshold:
                    adjacency[left_idx].append(right_idx)
                    adjacency[right_idx].append(left_idx)

        self.graph = {"nodes": nodes, "adjacency": adjacency}
        return self.graph

    def get_neighbors(self, node_idx: int) -> list[int]:
        """Return the indices of passages connected to ``node_idx``."""
        if not self.graph["adjacency"]:
            self.build()
        if node_idx not in self.graph["adjacency"]:
            raise IndexError(f"Unknown passage index: {node_idx}")
        return self.graph["adjacency"][node_idx]

    def get_passage(self, node_idx: int) -> str:
        """Return the text stored at ``node_idx``."""
        if not self.graph["nodes"]:
            self.build()
        if node_idx not in self.graph["nodes"]:
            raise IndexError(f"Unknown passage index: {node_idx}")
        return self.graph["nodes"][node_idx]["text"]
