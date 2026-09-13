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
# Keep one hash-keyed cache per client instance. This preserves reuse within a
# pipeline run while preventing separate clients/tests from sharing responses.
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

    interval = float(os.getenv("GROQ_MIN_REQUEST_INTERVAL", "2.5"))
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
) -> str:
    """Call Groq, caching responses and retrying transient failures.

    ``retries`` is the number of retries after the initial request. Rate-limit
    retries use exponential waits of 2, 4, 8, 16, and 32 seconds.
    """
    key = _cache_key(model, messages)
    try:
        client_cache = _RESPONSE_CACHE.setdefault(client, {})
    except TypeError:
        # Fallback for unusual non-weak-referenceable client doubles.
        client_cache = getattr(client, "_crithop_response_cache", None)
        if client_cache is None:
            client_cache = {}
            setattr(client, "_crithop_response_cache", client_cache)
    cached = client_cache.get(key) if use_cache else None
    if cached is not None:
        logger.debug("Groq response cache hit: %s", key[:12])
        return cached

    for attempt in range(retries + 1):
        try:
            _wait_for_request_slot(client)
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0,
            )
            text = response.choices[0].message.content.strip()
            if use_cache:
                client_cache[key] = text
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
                wait_seconds = 2 ** (attempt + 1)
                logger.warning(
                    "Groq rate limited (attempt %d/%d); retrying in %ss",
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
