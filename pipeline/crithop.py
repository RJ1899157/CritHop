"""Top-level CritHop pipeline orchestration."""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from dotenv import load_dotenv
from groq import Groq

from critique.isrel import IsRel
from critique.issup import IsSup
from critique.isuse import IsUse
from generation.generator import Generator
from graph.builder import PassageGraph
from graph.traversal import HopTraverser
from llm.openai_compatible_client import OpenAICompatibleClient
from retrieval.bge_retriever import BGERetriever
from retrieval.bm25_retriever import BM25Retriever
from retrieval.hybrid import HybridRetriever


def _extract_graph_data(graph_dict: dict) -> dict:
    """Convert PassageGraph internal dict to serializable frontend graph data."""
    if not isinstance(graph_dict, dict):
        return {"nodes": [], "edges": []}
    nodes_raw = graph_dict.get("nodes", {})
    nodes = []
    for idx, n_data in nodes_raw.items():
        text = n_data.get("text", "") if isinstance(n_data, dict) else str(n_data)
        title = ""
        if ":" in text[:60]:
            title = text.split(":", 1)[0].strip()
        elif "\n" in text[:60]:
            title = text.split("\n", 1)[0].strip()
        else:
            title = f"Passage {idx}"
        nodes.append({
            "id": int(idx),
            "title": title,
            "text": text,
            "snippet": text[:140] + ("..." if len(text) > 140 else ""),
        })
    adjacency = graph_dict.get("adjacency", {})
    edges = []
    seen = set()
    for src, neighbors in adjacency.items():
        for tgt in neighbors:
            edge_key = tuple(sorted([int(src), int(tgt)]))
            if edge_key not in seen and edge_key[0] != edge_key[1]:
                seen.add(edge_key)
                edges.append({"source": edge_key[0], "target": edge_key[1], "weight": 1.0})
    return {"nodes": nodes, "edges": edges}


class CritHop:
    """Run retrieval, multi-hop traversal, critique, and generation."""

    def __init__(self, config_path: str):
        load_dotenv()
        config_file = Path(config_path)
        with config_file.open("r", encoding="utf-8") as file:
            self.config = yaml.safe_load(file) or {}

        provider = os.getenv("LLM_PROVIDER", "groq").lower()
        self.model = (
            os.getenv("HIRO_MODEL", "")
            if provider == "hiro"
            else self.config.get("model", "openai/gpt-oss-120b")
        )
        self.groq_client = (
            None
            if provider == "local"
            else OpenAICompatibleClient(
                os.getenv("HIRO_API_KEY"),
                os.getenv("HIRO_BASE_URL"),
                self.model,
                request_interval=float(
                    os.getenv("HIRO_REQUEST_INTERVAL") or "0"
                ),
            )
            if provider == "hiro"
            else Groq(
                api_key=os.getenv("GROQ_API_KEY"),
                timeout=30.0,
                max_retries=0,
            )
        )
        use_reranker_env = os.getenv("USE_RERANKER", "false").lower()
        self.use_reranker = use_reranker_env in ("true", "1", "yes")
        if self.use_reranker:
            print("IsREL mode: reranker-slm")
        else:
            print("IsREL mode: prompted LLM")

        self.isrel = IsRel(model=self.model, client=self.groq_client)
        self.reranker = self._create_reranker() if self.use_reranker else None
        self.issup = IsSup(model=self.model, client=self.groq_client)
        self.isuse = IsUse(model=self.model, client=self.groq_client)

        self.bm25: BM25Retriever | None = None
        self.bge: BGERetriever | None = None
        self.hybrid: HybridRetriever | None = None
        self.graph: PassageGraph | None = None
        self.traverser: HopTraverser | None = None
        self.generator = Generator(
            groq_client=self.groq_client,
            model=self.model,
            issup=self.issup,
            isuse=self.isuse,
        )

    def run(self, question: str, context_passages: list[str]) -> dict:
        """Run the complete CritHop pipeline for one question."""
        try:
            self.graph = PassageGraph(context_passages, self.config)
            graph_data = self.graph.build()
            graph_dict = getattr(self.graph, "graph", None)
            if not isinstance(graph_dict, dict):
                graph_dict = graph_data if isinstance(graph_data, dict) else {}
            n_nodes = len(graph_dict.get("nodes", {}))
            n_edges = sum(len(neighbors) for neighbors in graph_dict.get("adjacency", {}).values()) // 2
            print(f"PassageGraph built: {n_nodes} nodes, {n_edges} edges")
            serializable_graph = _extract_graph_data(graph_dict)

            self.bm25 = BM25Retriever(context_passages)
            self.bge = BGERetriever(
                context_passages,
                self.config.get("embedding_model", "BAAI/bge-base-en-v1.5"),
                self.config.get("embedding_device", "cpu"),
                embeddings=getattr(self.graph, "embeddings", None),
            )
            self.hybrid = HybridRetriever(self.bm25, self.bge)

            top_k = int(self.config.get("top_k_retrieval", 10))
            initial_results = self.hybrid.retrieve(question, top_k)
            print(f"HybridRetriever returned {len(initial_results)} passages")
            start_passages = [index for index, _ in initial_results]

            self.traverser = HopTraverser(
                graph=self.graph,
                config=self.config,
                groq_client=self.groq_client,
                isrel=self.isrel,
                reranker=self.reranker,
            )
            traversed_passages = self.traverser.traverse(
                question,
                start_passages,
            )
            passages_for_generation = traversed_passages or [
                context_passages[index] for index in start_passages
            ]
            generation_result = self.generator.generate(
                question,
                passages_for_generation,
            )
            print(f"Generator received {len(generation_result.get('supporting_passages', []))} passages after IsSup")
            print(f"Final answer: {generation_result['answer']}")

            isrel_decisions = [
                decision
                for hop in self.traverser.hop_log
                for decision in hop["isrel_decisions"].values()
            ]
            return {
                "question": question,
                "answer": generation_result["answer"],
                "hop_trace": self.traverser.hop_log,
                "graph": serializable_graph,
                "critique_log": {
                    "isrel_decisions": isrel_decisions,
                    "issup_decisions": generation_result["issup_scores"],
                    "isuse_decision": generation_result["isuse_score"],
                },
                "supporting_passages": generation_result[
                    "supporting_passages"
                ],
                "retrieval_retry": generation_result["retrieval_retry"],
            }
        except Exception as exc:
            import traceback
            traceback.print_exc()
            return {
                "question": question,
                "answer": "Pipeline error — see logs",
                "hop_trace": [],
                "critique_log": {
                    "isrel_decisions": {},
                    "issup_decisions": [],
                    "isuse_decision": False,
                },
                "supporting_passages": [],
                "retrieval_retry": False,
            }

    def run_stream(self, question: str, context_passages: list[str]):
        """Stream progress events across every pipeline stage, finishing with the full result."""
        try:
            yield {
                "event": "stage",
                "stage": "graph_init",
                "message": f"Building passage graph for {len(context_passages)} evidence candidates...",
            }
            self.graph = PassageGraph(context_passages, self.config)
            graph_data = self.graph.build()
            graph_dict = getattr(self.graph, "graph", None)
            if not isinstance(graph_dict, dict):
                graph_dict = graph_data if isinstance(graph_data, dict) else {}
            n_nodes = len(graph_dict.get("nodes", {}))
            n_edges = sum(len(neighbors) for neighbors in graph_dict.get("adjacency", {}).values()) // 2
            serializable_graph = _extract_graph_data(graph_dict)

            yield {
                "event": "graph_built",
                "nodes": n_nodes,
                "edges": n_edges,
                "graph_data": serializable_graph,
                "message": f"PassageGraph active: {n_nodes} nodes, {n_edges} semantic similarity edges",
            }

            yield {
                "event": "stage",
                "stage": "retrieval",
                "message": "Executing hybrid lexical (BM25) & dense (BGE) retrieval...",
            }
            self.bm25 = BM25Retriever(context_passages)
            self.bge = BGERetriever(
                context_passages,
                self.config.get("embedding_model", "BAAI/bge-base-en-v1.5"),
                self.config.get("embedding_device", "cpu"),
                embeddings=getattr(self.graph, "embeddings", None),
            )
            self.hybrid = HybridRetriever(self.bm25, self.bge)

            top_k = int(self.config.get("top_k_retrieval", 10))
            initial_results = self.hybrid.retrieve(question, top_k)
            start_passages = [index for index, _ in initial_results]

            yield {
                "event": "retrieval_complete",
                "count": len(initial_results),
                "top_passages": start_passages[:5],
                "message": f"Hybrid retriever ranked {len(initial_results)} seed passages",
            }

            self.traverser = HopTraverser(
                graph=self.graph,
                config=self.config,
                groq_client=self.groq_client,
                isrel=self.isrel,
                reranker=self.reranker,
            )

            traversed_passages = []
            for ev in self.traverser.traverse_stream(question, start_passages):
                if ev.get("event") == "traversal_complete":
                    traversed_passages = ev.get("passages", [])
                else:
                    yield ev

            passages_for_generation = traversed_passages or [
                context_passages[index] for index in start_passages
            ]

            yield {
                "event": "stage",
                "stage": "generation",
                "message": f"Synthesizing grounded answer and running Self-RAG critiques over {len(passages_for_generation)} passages...",
            }

            generation_result = self.generator.generate(
                question,
                passages_for_generation,
            )

            yield {
                "event": "critique_complete",
                "issup_scores": generation_result["issup_scores"],
                "isuse_score": generation_result["isuse_score"],
                "supporting_count": len(generation_result.get("supporting_passages", [])),
                "message": f"Self-RAG: verified {len(generation_result.get('supporting_passages', []))} supporting passages, IsUSE: {'valid' if generation_result['isuse_score'] else 'retried'}",
            }

            isrel_decisions = [
                decision
                for hop in self.traverser.hop_log
                for decision in hop["isrel_decisions"].values()
            ]

            final_result = {
                "question": question,
                "answer": generation_result["answer"],
                "hop_trace": self.traverser.hop_log,
                "graph": serializable_graph,
                "critique_log": {
                    "isrel_decisions": isrel_decisions,
                    "issup_decisions": generation_result["issup_scores"],
                    "isuse_decision": generation_result["isuse_score"],
                },
                "supporting_passages": generation_result["supporting_passages"],
                "retrieval_retry": generation_result["retrieval_retry"],
            }

            yield {
                "event": "complete",
                "result": final_result,
            }

        except Exception as exc:
            import traceback
            traceback.print_exc()
            error_result = {
                "question": question,
                "answer": f"Pipeline error: {exc}",
                "hop_trace": [],
                "critique_log": {
                    "isrel_decisions": [],
                    "issup_decisions": [],
                    "isuse_decision": False,
                },
                "supporting_passages": [],
                "retrieval_retry": False,
            }
            yield {
                "event": "error",
                "message": str(exc),
                "result": error_result,
            }

    def _create_reranker(self):
        try:
            from reranker.reranker import Reranker
        except ImportError as error:
            raise ImportError(
                "USE_RERANKER=true, but reranker/reranker.py is not available."
            ) from error

        adapter_path = os.getenv(
            "RERANKER_ADAPTER_PATH",
            self.config.get("reranker_adapter_path"),
        )
        if not adapter_path:
            raise ValueError("reranker_adapter_path must be set when USE_RERANKER=true")
        reranker = Reranker(adapter_path=adapter_path)
        if not hasattr(reranker, "is_relevant"):
            raise TypeError(
                "Phase 2 Reranker must expose is_relevant(query, passage, "
                "threshold) -> bool."
            )
        return reranker
