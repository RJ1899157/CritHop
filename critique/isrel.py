"""Relevance critique for retrieved passages."""

from __future__ import annotations

import os

from groq import Groq

from critique.prompts import ISREL_PROMPT


class IsRel:
    """Check whether a passage is relevant to the current reasoning step."""

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
        reasoning_step: str,
        passage: str,
    ) -> bool:
        """Return True when Groq classifies the passage as relevant."""
        prompt = ISREL_PROMPT.format(
            question=question,
            reasoning_step=reasoning_step,
            passage=passage,
        )

        for _ in range(3):
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=3,
            )
            decision = response.choices[0].message.content.strip().upper()
            if decision == "YES":
                return True
            if decision == "NO":
                return False

        return False
