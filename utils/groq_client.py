"""Shared Groq call helper with in-process caching and retry handling."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import weakref
from typing import Any


logger = logging.getLogger(__name__)
# Keep an in-memory LRU cache up to 1000 items to speed up repeated queries,
# plus a per-client cache.
_GLOBAL_RESPONSE_CACHE: dict[str, str] = {}
_MAX_CACHE_SIZE = 1000
_RESPONSE_CACHE: weakref.WeakKeyDictionary[Any, dict[str, str]] = (
    weakref.WeakKeyDictionary()
)
_THROTTLE_LOCK = threading.Lock()
_LAST_REQUEST_AT = 0.0


def _wait_for_request_slot(client: Any) -> None:
    """Keep real Groq requests below the free-tier RPM limit."""
    global _LAST_REQUEST_AT
    if not client.__class__.__module__.startswith("groq"):
        return

    interval = float(os.getenv("GROQ_MIN_REQUEST_INTERVAL", "0.5"))
    with _THROTTLE_LOCK:
        now = time.monotonic()
        wait_seconds = interval - (now - _LAST_REQUEST_AT)
        if wait_seconds > 0:
            logger.info("Groq request throttle; waiting %.2fs", wait_seconds)
            time.sleep(wait_seconds)
        _LAST_REQUEST_AT = time.monotonic()


def _cache_key(model: str, messages: list[dict[str, Any]]) -> str:
    payload = json.dumps(
        {"model": model, "messages": messages},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def call_groq(
    client: Any,
    model: str,
    messages: list[dict[str, Any]],
    retries: int = 5,
    use_cache: bool = True,
    max_tokens: int | None = None,
) -> str:
    """Call Groq, caching responses and retrying transient failures.

    ``retries`` is the number of retries after the initial request. Rate-limit
    retries use exponential waits of 2, 4, 8, 16, and 32 seconds.
    """
    is_real_groq = client.__class__.__module__.startswith("groq")
    key = _cache_key(model, messages)
    if use_cache and is_real_groq:
        if key in _GLOBAL_RESPONSE_CACHE:
            logger.debug("Groq global cache hit: %s", key[:12])
            return _GLOBAL_RESPONSE_CACHE[key]

    client_cache = None
    if is_real_groq:
        try:
            client_cache = _RESPONSE_CACHE.setdefault(client, {})
        except TypeError:
            client_cache = getattr(client, "_crithop_response_cache", None)
            if client_cache is None:
                client_cache = {}
                try:
                    setattr(client, "_crithop_response_cache", client_cache)
                except AttributeError:
                    pass
        cached = client_cache.get(key) if use_cache else None
        if cached is not None:
            logger.debug("Groq response cache hit: %s", key[:12])
            return cached

    for attempt in range(retries + 1):
        try:
            _wait_for_request_slot(client)
            create_params: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": 0,
            }
            if max_tokens:
                create_params["max_completion_tokens"] = max_tokens
            response = client.chat.completions.create(**create_params)
            msg = response.choices[0].message
            text = (msg.content or "").strip()
            # If content is empty but model emitted reasoning, extract conclusion or use reasoning
            if not text and hasattr(msg, "reasoning") and msg.reasoning:
                text = msg.reasoning.strip()

            if use_cache and text and is_real_groq:
                if client_cache is not None:
                    client_cache[key] = text
                if len(_GLOBAL_RESPONSE_CACHE) >= _MAX_CACHE_SIZE:
                    # Evict oldest entry
                    first_k = next(iter(_GLOBAL_RESPONSE_CACHE))
                    del _GLOBAL_RESPONSE_CACHE[first_k]
                _GLOBAL_RESPONSE_CACHE[key] = text
            return text
        except Exception as exc:
            if attempt >= retries:
                raise

            status_code = getattr(exc, "status_code", None)
            error_text = str(exc).lower()
            if status_code == 429 and any(
                marker in error_text
                for marker in ("tokens per day", "tpd", "daily token")
            ):
                logger.error(
                    "Groq daily token limit exhausted; retrying will not help: %s",
                    exc,
                )
                raise RuntimeError(
                    "Groq daily token limit exhausted. Wait for the quota reset, "
                    "reduce the evaluation, or switch to a model/provider with "
                    "available quota."
                ) from exc
            if status_code == 429:
                import re
                match = re.search(r"try again in ([0-9.]+)\s*(ms|s)?", error_text)
                if match:
                    raw_val = float(match.group(1))
                    unit = (match.group(2) or "s").lower()
                    suggested_wait = (raw_val / 1000.0 if unit == "ms" else raw_val) + 0.2
                else:
                    suggested_wait = 1.0 + (1.0 * attempt)
                wait_seconds = min(max(1.0, suggested_wait), 5.0)
                logger.warning(
                    "Groq rate limited (attempt %d/%d); waiting %.2fs for quota reset",
                    attempt + 1,
                    retries,
                    wait_seconds,
                )
                time.sleep(wait_seconds)
            else:
                logger.warning(
                    "Groq request failed (attempt %d/%d); retrying immediately: %s",
                    attempt + 1,
                    retries,
                    exc,
                )

    raise RuntimeError("Groq request failed after retries")
