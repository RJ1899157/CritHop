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
                    os.getenv("HIRO_REQUEST_INTERVAL", "0")
                ),
            )
            if provider == "hiro"
            else Groq(
                api_key=os.getenv("GROQ_API_KEY"),
                timeout=30.0,
                max_retries=0,
            )
        )
        self.isrel = self._create_isrel()
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
        self.graph = PassageGraph(context_passages, self.config)
        self.graph.build()

        self.bm25 = BM25Retriever(context_passages)
        self.bge = BGERetriever(
            context_passages,
            self.config.get("embedding_model", "BAAI/bge-base-en-v1.5"),
            self.config.get("embedding_device", "cpu"),
        )
        self.hybrid = HybridRetriever(self.bm25, self.bge)

        top_k = int(self.config.get("top_k_retrieval", 10))
        initial_results = self.hybrid.retrieve(question, top_k)
        start_passages = [index for index, _ in initial_results]

        self.traverser = HopTraverser(
            graph=self.graph,
            config=self.config,
            groq_client=self.groq_client,
            isrel=self.isrel,
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

        isrel_decisions = [
            decision
            for hop in self.traverser.hop_log
            for decision in hop["isrel_decisions"].values()
        ]
        return {
            "question": question,
            "answer": generation_result["answer"],
            "hop_trace": self.traverser.hop_log,
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

    def _create_isrel(self):
        use_reranker = os.getenv("USE_RERANKER", "false").lower() == "true"
        if not use_reranker:
            return IsRel(model=self.model, client=self.groq_client)

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
