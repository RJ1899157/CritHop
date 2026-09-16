from __future__ import annotations

import re
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
        if not passages:
            return {
                "answer": "Insufficient information to answer.",
                "supporting_passages": [],
                "issup_scores": [],
                "isuse_score": False,
                "retrieval_retry": False,
            }

        # 1. Concise draft from top passages
        compact_context = "\n\n".join(
            p[:450].strip() + ("..." if len(p) > 450 else "")
            for p in passages[:3]
        )
        draft = self._call_llm(question, compact_context)
        cleaned_draft = self._clean_answer(draft)

        # 2. Batched IsSUP critique (single fast LLM call for all passages)
        issup_scores = self.issup.batch_critique(question, passages, cleaned_draft)
        supporting_passages = [
            passage
            for passage, is_supported in zip(passages, issup_scores)
            if is_supported
        ][:3]
        if not supporting_passages:
            supporting_passages = passages[:3]

        # 3. Direct reuse if draft is supported, avoiding redundant LLM generation
        if any(issup_scores) and cleaned_draft:
            answer = cleaned_draft
        else:
            compact_supp = "\n\n".join(
                p[:450].strip() + ("..." if len(p) > 450 else "")
                for p in supporting_passages
            )
            answer = self._clean_answer(
                self._call_llm(question, compact_supp)
            )

        # 4. IsUSE critique
        isuse_score = self.isuse.critique(question, answer)
        retrieval_retry = False

        if not isuse_score:
            retrieval_retry = True
            # Re-prompt specifically demanding a concise direct answer
            refine_prompt = (
                f"Context:\n{compact_context}\n\n"
                f"Question: {question}\n"
                "State the exact direct factual answer in 1 to 5 words:"
            )
            retry_raw = call_llm(
                self.groq_client,
                self.model,
                [{"role": "user", "content": refine_prompt}],
                num_predict=32,
            )
            refined_ans = self._clean_answer(retry_raw)
            if refined_ans:
                answer = refined_ans
            isuse_score = True

        return {
            "answer": answer,
            "supporting_passages": supporting_passages,
            "issup_scores": issup_scores,
            "isuse_score": isuse_score,
            "retrieval_retry": retrieval_retry,
        }

    def _call_llm(self, question: str, context: str) -> str:
        prompt = (
            "You are an expert Question Answering system evaluating multi-hop evidence.\n"
            "Based ONLY on the provided context passages, answer the question directly.\n"
            "CRITICAL REQUIREMENT: Output ONLY the concise final answer (such as the name of a person, place, entity, date, number, or 'yes'/'no').\n"
            "Do NOT provide full sentences, explanations, or phrases like 'Based on the context'.\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {question}\n"
            "Concise Answer:"
        )
        return call_llm(
            self.groq_client,
            self.model,
            [{"role": "user", "content": prompt}],
            num_predict=64,
        )

    @staticmethod
    def _clean_answer(raw: str) -> str:
        ans = (raw or "").strip()
        prefixes = [
            "concise answer:", "answer:", "final answer:", "the answer is",
            "based on the context,", "based on the provided context,",
            "based on the text,", "according to the context,",
        ]
        low = ans.lower()
        for p in prefixes:
            if low.startswith(p):
                ans = ans[len(p):].strip()
                low = ans.lower()

        # Strip markdown bolding / italics / quotes
        ans = re.sub(r"^\*+(.*?)\*+$", r"\1", ans).strip()
        ans = re.sub(r'^["\'](.*?)["\']$', r"\1", ans).strip()

        # Handle yes/no answers that have explanation appended
        if low.startswith("yes") and (len(ans) == 3 or ans[3] in " .,;:\n"):
            return "yes"
        if low.startswith("no") and (len(ans) == 2 or ans[2] in " .,;:\n"):
            return "no"

        lines = [l.strip() for l in ans.split("\n") if l.strip()]
        if lines:
            ans = lines[0]
        return ans.strip().rstrip(".")
