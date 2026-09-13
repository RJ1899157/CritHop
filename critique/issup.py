"""Support critique for proposed answers."""

from __future__ import annotations

import os

from groq import Groq

from critique.prompts import ISSUP_PROMPT
from utils.llm_client import call_llm


class IsSup:
    """Check whether a passage directly supports a proposed answer."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "openai/gpt-oss-120b",
        client=None,
    ):
        self.client = client or Groq(
            api_key=api_key or os.getenv("GROQ_API_KEY"),
            timeout=30.0,
            max_retries=0,
        )
        self.model = model

    def critique(
        self,
        question: str,
        passage: str,
        answer: str,
    ) -> bool:
        """Return True when Groq classifies the passage as supporting."""
        prompt = ISSUP_PROMPT.format(
            question=question,
            passage=passage,
            answer=answer,
        )

        for attempt in range(3):
            decision = call_llm(
                self.client,
                self.model,
                [{"role": "user", "content": prompt}],
                use_cache=attempt == 0,
                num_predict=8,
            ).upper()
            if decision == "YES":
                return True
            if decision == "NO":
                return False

        return False

    def batch_critique(
        self,
        question: str,
        passages: list[str],
        answer: str,
    ) -> list[bool]:
        """Critique all passages in a single call for low latency."""
        if not passages:
            return []
        if len(passages) == 1:
            return [self.critique(question, passages[0], answer)]

        formatted = "\n\n".join(f"Passage [{i}]: {p}" for i, p in enumerate(passages))
        prompt = (
            f"Question: {question}\n"
            f"Answer: {answer}\n\n"
            f"Passages:\n{formatted}\n\n"
            "For each passage [0] to [N], determine if it directly supports the answer.\n"
            'Return valid JSON array of booleans matching the passage order, e.g. [true, false, true].\nJSON:'
        )
        try:
            resp = call_llm(
                self.client,
                self.model,
                [{"role": "user", "content": prompt}],
                use_cache=True,
                num_predict=32,
            ).strip()
            import json, re
            match = re.search(r"\[.*?\]", resp, re.DOTALL)
            if match:
                decisions = json.loads(match.group(0))
                if isinstance(decisions, list) and len(decisions) == len(passages):
                    return [bool(d) for d in decisions]
        except Exception:
            pass

        # Fallback: overlap check
        a_tokens = set(answer.lower().split())
        return [bool(set(p.lower().split()) & a_tokens) for p in passages]
