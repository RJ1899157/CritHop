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
