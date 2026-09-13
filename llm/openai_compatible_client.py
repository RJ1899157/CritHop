"""OpenAI-compatible HTTP client for provider adapters such as Hiro."""

from __future__ import annotations

import time
from types import SimpleNamespace

import httpx


class OpenAICompatibleClient:
    def __init__(
        self,
        api_key: str | None,
        base_url: str | None,
        model: str,
        timeout: float = 60.0,
        request_interval: float = 0.0,
    ):
        if not api_key:
            raise RuntimeError("HIRO_API_KEY is required when LLM_PROVIDER=hiro")
        if not base_url:
            raise RuntimeError("HIRO_BASE_URL is required when LLM_PROVIDER=hiro")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.request_interval = request_interval
        self._last_request_at = 0.0

    @property
    def chat(self):
        return SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, *, model=None, messages, temperature=0, max_tokens=None):
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.request_interval:
            time.sleep(self.request_interval - elapsed)
        payload = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
            timeout=self.timeout,
        )
        self._last_request_at = time.monotonic()
        response.raise_for_status()
        data = response.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError(
                f"Hiro response did not contain chat completion content: {data}"
            ) from error
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )
