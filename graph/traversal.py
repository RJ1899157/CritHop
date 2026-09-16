"""HopRAG-style traversal over a semantic passage graph."""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from critique.isrel import IsRel
from graph.builder import PassageGraph
from utils.llm_client import call_llm


class HopTraverser:
    """Traverse relevant neighboring passages across multiple reasoning hops."""

    def __init__(
        self,
        graph: PassageGraph,
        config: dict,
        groq_client,
        isrel: IsRel,
        reranker=None,
    ):
        self.graph = graph
        self.config = config
        self.groq_client = groq_client
        self.isrel = isrel
        self.reranker = reranker
        self.model = config.get("model", "openai/gpt-oss-120b")
        self.hop_log: list[dict[str, Any]] = []
        self.decision_diff_counter = 0

    def traverse(
        self,
        question: str,
        start_passages: list[int],
    ) -> list[str]:
        """Traverse relevant passages and record every hop decision."""
        max_hops = int(self.config.get("max_hops", 3))
        top_k = int(self.config.get("top_k_after_isrel", 5))
        reasoning_step = question
        current_nodes = list(dict.fromkeys(start_passages))
        surviving_indices: list[int] = []
        self.hop_log = []
        self.decision_diff_counter = 0

        for hop_number in range(max_hops):
            print(f"HopTraverser starting hop {hop_number + 1}")
            candidate_indices = self._neighbor_candidates(current_nodes)
            if hop_number == 0:
                for n_idx in current_nodes:
                    if n_idx not in candidate_indices:
                        candidate_indices.append(n_idx)
            decisions: dict[int, bool] = {}

            if self.reranker is not None:
                threshold = float(self.config.get("isrel_threshold", 0.35))
                passages = [self.graph.get_passage(node_idx) for node_idx in candidate_indices]
                if hasattr(self.reranker, "_scores"):
                    scores = self.reranker._scores(question, passages)
                    for node_idx, score in zip(candidate_indices, scores):
                        decisions[node_idx] = bool(score >= threshold)
                    if not any(decisions.values()) and scores:
                        ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:2]
                        for r_idx in ranked_indices:
                            decisions[candidate_indices[r_idx]] = True
                else:
                    for node_idx, passage in zip(candidate_indices, passages):
                        decisions[node_idx] = self.reranker.is_relevant(
                            query=question,
                            passage=passage,
                            threshold=threshold,
                        )
            else:
                passages = [self.graph.get_passage(node_idx) for node_idx in candidate_indices]
                if hasattr(self.isrel, "batch_critique"):
                    batch_decisions = self.isrel.batch_critique(
                        question,
                        reasoning_step,
                        passages,
                    )
                    for node_idx, dec in zip(candidate_indices, batch_decisions):
                        decisions[node_idx] = dec
                elif hasattr(self.isrel, "is_relevant"):
                    for node_idx, passage in zip(candidate_indices, passages):
                        decisions[node_idx] = self.isrel.is_relevant(
                            question,
                            passage,
                            threshold=float(self.config.get("isrel_threshold", 0.7)),
                        )
                else:
                    for node_idx in candidate_indices:
                        passage = self.graph.get_passage(node_idx)
                        decisions[node_idx] = self.isrel.critique(
                            question,
                            reasoning_step,
                            passage,
                        )

            kept = sum(1 for d in decisions.values() if d)
            pruned = len(decisions) - kept
            print(f"IsREL decisions: {kept} kept, {pruned} pruned")

            relevant_indices = [
                node_idx
                for node_idx in candidate_indices
                if decisions[node_idx]
            ][:top_k]

            # If IsREL prunes ALL passages in a hop, fall back to top-1 by BGE score and continue
            if not relevant_indices and candidate_indices:
                try:
                    q_emb = self.graph.model.encode(
                        [reasoning_step],
                        convert_to_numpy=True,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    )
                    cand_embs = [
                        self.graph.graph["nodes"][idx]["embedding"]
                        for idx in candidate_indices
                    ]
                    scores = (np.array(cand_embs) @ q_emb.T).flatten()
                    best_cand_idx = candidate_indices[int(np.argmax(scores))]
                    relevant_indices = [best_cand_idx]
                except Exception:
                    relevant_indices = [candidate_indices[0]]

            hop_entry = {
                "hop": hop_number + 1,
                "passages_considered": candidate_indices,
                "isrel_decisions": decisions,
                "reasoning_step": reasoning_step,
            }
            self.hop_log.append(hop_entry)

            if not relevant_indices:
                break

            surviving_indices.extend(relevant_indices)
            next_reasoning_step, next_node = self._choose_next_hop(
                question,
                reasoning_step,
                relevant_indices,
            )
            reasoning_step = next_reasoning_step
            current_nodes = [next_node] if next_node is not None else relevant_indices

            self.hop_log[-1]["selected_passages"] = relevant_indices
            self.hop_log[-1]["next_node"] = next_node
            self.hop_log[-1]["llm_reasoning_step"] = reasoning_step

            # Early termination: if sufficient multi-hop evidence gathered
            if hop_number >= 1 and len(set(surviving_indices)) >= 2:
                print(f"HopTraverser early termination at hop {hop_number + 1}: sufficient evidence gathered")
                break

        if self.reranker is not None:
            print(
                f"IsREL decisions differed between reranker and prompted IsREL: {self.decision_diff_counter}"
            )

        ordered_unique_indices = list(dict.fromkeys(surviving_indices))
        if not ordered_unique_indices and start_passages:
            ordered_unique_indices = [start_passages[0]]
        return [self.graph.get_passage(idx) for idx in ordered_unique_indices]

    def _neighbor_candidates(self, current_nodes: list[int]) -> list[int]:
        candidates: list[int] = []
        for node_idx in current_nodes:
            for neighbor_idx in self.graph.get_neighbors(node_idx):
                if neighbor_idx not in candidates:
                    candidates.append(neighbor_idx)
        return candidates

    def _choose_next_hop(
        self,
        question: str,
        reasoning_step: str,
        relevant_indices: list[int],
    ) -> tuple[str, int | None]:
        passages = "\n".join(
            f"[{idx}] {self.graph.get_passage(idx)[:250].strip()}..."
            if len(self.graph.get_passage(idx)) > 250
            else f"[{idx}] {self.graph.get_passage(idx).strip()}"
            for idx in relevant_indices[:3]
        )
        prompt = (
            "Given the question, current reasoning step, and relevant passages, "
            "produce the next reasoning step and choose the next passage to hop "
            "to. Return only valid JSON with keys `reasoning_step` and "
            "`passage_index`.\n\n"
            f"Question: {question}\n"
            f"Current reasoning step: {reasoning_step}\n"
            f"Relevant passages:\n{passages}"
        )
        content = call_llm(
            self.groq_client,
            self.model,
            [{"role": "user", "content": prompt}],
            num_predict=64,
        )

        try:
            parsed = json.loads(content)
            next_step = str(parsed["reasoning_step"])
            passage_index = int(parsed["passage_index"])
            if passage_index not in relevant_indices:
                passage_index = None
            return next_step, passage_index
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            return content, None
