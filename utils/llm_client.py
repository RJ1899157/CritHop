"""Provider-neutral text generation for online and local evaluation runs."""

from __future__ import annotations

import json
import os
from urllib.request import Request, urlopen

from utils.groq_client import call_groq


def call_llm(
    client,
    model: str,
    messages: list[dict[str, str]],
    use_cache: bool = True,
    num_predict: int | None = None,
) -> str:
    """Generate text using Groq or a local Ollama server.

    Set ``LLM_PROVIDER=local`` to use Ollama. The default remains Groq so the
    existing interactive application behavior is unchanged.
    """
    provider = os.getenv("LLM_PROVIDER", "groq").lower()
    if provider != "local":
        return call_groq(client, model, messages, use_cache=use_cache)

    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    payload = json.dumps({
        "model": os.getenv("LOCAL_MODEL", model),
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0,
            "num_predict": num_predict or int(
                os.getenv("OLLAMA_NUM_PREDICT", "128")
            ),
        },
    }).encode("utf-8")
    request = Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    timeout = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))
    with urlopen(request, timeout=timeout) as response:
        result = json.loads(response.read().decode("utf-8"))
    return result["message"]["content"].strip()
