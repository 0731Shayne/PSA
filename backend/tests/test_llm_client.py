import asyncio
import json
from contextlib import aclosing

import httpx
import pytest
from openai import AsyncOpenAI

from src.integrations import llm_client
from src.integrations.llm_client import ChatMessage, LLMClient


def _mock_sdk(monkeypatch, handler):
    monkeypatch.setenv("DEEPSEEK_MOCK", "false")
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = AsyncOpenAI(api_key="test-key", base_url="https://deepseek.test", http_client=http_client)
    monkeypatch.setattr(LLMClient, "_client", lambda self: client)
    return http_client


@pytest.mark.parametrize("thinking", [True, False])
async def test_stop_stream_closes_provider_response(monkeypatch, thinking):
    class ProviderStream(httpx.AsyncByteStream):
        closed = False

        async def __aiter__(self):
            chunk = {"choices": [{"index": 0, "delta": {"content": "第一步"}}]}
            yield ("data: " + json.dumps(chunk) + "\n\n").encode()
            await asyncio.Future()

        async def aclose(self):
            self.closed = True

    stream = ProviderStream()

    def handler(request):
        assert request.url.path == "/chat/completions"
        payload = json.loads(request.content)
        assert payload["stream"] is True
        assert payload["thinking"]["type"] == ("enabled" if thinking else "disabled")
        assert ("reasoning_effort" in payload) is thinking
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=stream)

    http_client = _mock_sdk(monkeypatch, handler)
    async with aclosing(LLMClient().stream_chat([ChatMessage("user", "题目")], thinking=thinking)) as answer:
        assert await anext(answer) == "第一步"
    assert stream.closed and http_client.is_closed


async def test_completion_deadline_cancels_provider_request(monkeypatch):
    provider_cancelled = asyncio.Event()

    async def handler(request):
        assert json.loads(request.content)["stream"] is False
        try:
            await asyncio.Future()
        finally:
            provider_cancelled.set()

    http_client = _mock_sdk(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "DEEPSEEK_TIMEOUT_SECONDS", 0.05)
    with pytest.raises(TimeoutError):
        await LLMClient().chat([ChatMessage("user", "题目")])
    assert provider_cancelled.is_set() and http_client.is_closed
