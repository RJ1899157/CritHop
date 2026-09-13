"""Answer generation with support and usefulness critique."""

from __future__ import annotations

from critique.isuse import IsUse
from critique.issup import IsSup
from utils.llm_client import call_llm


class Generator:
    """Generate answers grounded in passages accepted by the critics."""

    def __init__(
        self,
        groq_client,
        model: str,
        issup: IsSup,
        isuse: IsUse,
    ):
        self.groq_client = groq_client
        self.model = model
        self.issup = issup
        self.isuse = isuse

    def generate(self, question: str, passages: list[str]) -> dict:
        """Generate a grounded answer and return all critique decisions."""
        draft = self._call_llm(question, "\n\n".join(passages))
        issup_scores = [
            self.issup.critique(question, passage, draft)
            for passage in passages
        ]
        supporting_passages = [
            passage
            for passage, is_supported in zip(passages, issup_scores)
            if is_supported
        ][:3]
        if not supporting_passages:
            supporting_passages = passages[:3]

        answer = self._call_llm(
            question,
            "\n\n".join(supporting_passages),
        )
        isuse_score = self.isuse.critique(question, answer)
        retrieval_retry = False

        if not isuse_score:
            retrieval_retry = True
            fallback_passages = passages[:3]
            answer = self._call_llm(
                question,
                "\n\n".join(fallback_passages),
            )
            supporting_passages = fallback_passages
            isuse_score = self.isuse.critique(question, answer)

        return {
            "answer": answer,
            "supporting_passages": supporting_passages,
            "issup_scores": issup_scores,
            "isuse_score": isuse_score,
            "retrieval_retry": retrieval_retry,
        }

    def _call_llm(self, question: str, context: str) -> str:
        prompt = (
            "Answer the question using only the provided context.\n"
            f"Question: {question}\n"
            f"Context: {context}\n"
            "Answer:"
        )
        return call_llm(
            self.groq_client,
            self.model,
            [{"role": "user", "content": prompt}],
            num_predict=128,
        )
