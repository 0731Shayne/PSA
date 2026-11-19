"""Unified DeepSeek client built on the OpenAI Python SDK.

Production LLM calls share the configured endpoint and model.
The small mock path exists only for offline tests and never uses a second model.
"""
from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator
from typing import Any


DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-pro")
DEEPSEEK_REASONING_EFFORT = os.environ.get("DEEPSEEK_REASONING_EFFORT", "high")
DEEPSEEK_USE_ENV_PROXY = os.environ.get("DEEPSEEK_USE_ENV_PROXY", "false").lower() == "true"
DEEPSEEK_TIMEOUT_SECONDS = max(5.0, float(os.environ.get("DEEPSEEK_TIMEOUT_SECONDS", "60")))
DEEPSEEK_MAX_RETRIES = max(0, min(int(os.environ.get("DEEPSEEK_MAX_RETRIES", "2")), 5))


class ChatMessage:
    __slots__ = ("role", "content")

    def __init__(self, role: str, content: str) -> None:
        self.role = role
        self.content = content


class LLMClient:
    """DeepSeek client with cancellation propagated to the HTTP transport."""

    def __init__(self, step: int | None = None, name: str | None = None) -> None:
        self.step = step
        self.name = name
        self.model = DEEPSEEK_MODEL
        # Backward-compatible test switch; production .env does not set this.
        self.mock = os.environ.get("DEEPSEEK_MOCK", "false").lower() == "true"
        self.provider = "mock" if self.mock else "deepseek"

    def _client(self):
        from openai import AsyncOpenAI, DefaultAsyncHttpxClient

        api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not api_key:
            raise RuntimeError("DEEPSEEK_API_KEY 未配置，请在 backend/.env 中设置")
        # Do not inherit stale system proxy variables by default. This keeps the
        # teaching assistant available when a local proxy/VPN is switched off.
        # Deployments that intentionally rely on environment proxies can opt in.
        http_client = DefaultAsyncHttpxClient(trust_env=DEEPSEEK_USE_ENV_PROXY)
        return AsyncOpenAI(
            api_key=api_key,
            base_url=DEEPSEEK_BASE_URL,
            http_client=http_client,
            timeout=DEEPSEEK_TIMEOUT_SECONDS,
            max_retries=DEEPSEEK_MAX_RETRIES,
        )

    async def complete_response(
        self,
        messages: list[dict[str, Any]],
        *,
        max_tokens: int = 32768,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | None = None,
        thinking: bool = True,
        **kwargs: Any,
    ):
        """Return the raw OpenAI-SDK response; always uses non-streaming mode."""
        if self.mock:
            raise RuntimeError("Raw responses are unavailable in DeepSeek mock mode")

        params: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "extra_body": {"thinking": {"type": "enabled" if thinking else "disabled"}},
            "max_tokens": max_tokens,
        }
        if thinking:
            params["reasoning_effort"] = DEEPSEEK_REASONING_EFFORT
        if tools:
            params["tools"] = tools
        if tool_choice:
            params["tool_choice"] = tool_choice
        # Allow safe OpenAI-compatible options without overriding the fixed
        # model, endpoint or non-streaming contract.
        for key in ("temperature", "top_p", "stop", "response_format"):
            if key in kwargs:
                params[key] = kwargs[key]
        async with self._client() as client:
            async with asyncio.timeout(DEEPSEEK_TIMEOUT_SECONDS):
                return await client.chat.completions.create(**params)

    async def chat(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 32768,
        **kwargs: Any,
    ) -> str:
        if self.mock:
            return self._mock_response(messages)
        payload: list[dict[str, Any]] = []
        if system:
            payload.append({"role": "system", "content": system})
        payload.extend({"role": m.role, "content": m.content} for m in messages if m.role != "system")
        response = await self.complete_response(payload, max_tokens=max_tokens, **kwargs)
        content = response.choices[0].message.content if response.choices else ""
        return content or ""

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 32768,
        *,
        thinking: bool = True,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Yield answer text as it arrives from the model."""
        if self.mock:
            yield self._mock_response(messages)
            return

        payload: list[dict[str, Any]] = []
        if system:
            payload.append({"role": "system", "content": system})
        payload.extend({"role": m.role, "content": m.content} for m in messages if m.role != "system")
        params: dict[str, Any] = {
            "model": self.model,
            "messages": payload,
            "stream": True,
            "extra_body": {"thinking": {"type": "enabled" if thinking else "disabled"}},
            "max_tokens": max_tokens,
        }
        if thinking:
            params["reasoning_effort"] = DEEPSEEK_REASONING_EFFORT
        for key in ("temperature", "top_p", "stop"):
            if key in kwargs:
                params[key] = kwargs[key]
        deadline = asyncio.get_running_loop().time() + DEEPSEEK_TIMEOUT_SECONDS
        async with self._client() as client:
            async with asyncio.timeout_at(deadline):
                response = await client.chat.completions.create(**params)
            async with response:
                while True:
                    async with asyncio.timeout_at(deadline):
                        chunk = await anext(response, None)
                    if chunk is None:
                        break
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content

    async def chat_json(
        self,
        messages: list[ChatMessage],
        system: str | None = None,
        max_tokens: int = 32768,
        **kwargs: Any,
    ) -> Any:
        text = (await self.chat(messages, system, max_tokens, **kwargs)).strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(text)

    def _mock_response(self, messages: list[ChatMessage]) -> str:
        last = messages[-1].content if messages else ""
        return json.dumps({"mock": True, "echo": last[:80]}, ensure_ascii=False)
