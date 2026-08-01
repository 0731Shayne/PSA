import httpx
import pytest

from src.integrations import local_knowledge as module
from src.integrations.local_knowledge import (
    LocalKnowledgeError,
    OllamaEmbeddingClient,
    chunk_text,
    cosine_similarity,
    extract_document_text,
)


def test_extract_and_chunk_utf8_markdown_with_overlap():
    text = extract_document_text(
        "条件概率.md",
        ("# 条件概率\n\nP(A|B)=P(AB)/P(B)。\n\n" + "贝叶斯公式用于更新概率。" * 80).encode(),
    )
    chunks = chunk_text(text, chunk_size=300, overlap=50)

    assert text.startswith("# 条件概率")
    assert len(chunks) > 1
    assert all(1 <= len(item) <= 300 for item in chunks)
    assert chunks[0][-30:] in chunks[1]


def test_extract_rejects_legacy_office_format():
    with pytest.raises(LocalKnowledgeError, match="PDF、DOCX"):
        extract_document_text("旧讲义.doc", b"legacy")


def test_cosine_similarity_orders_semantic_vectors():
    query = [1.0, 0.0, 0.0]
    assert cosine_similarity(query, [1.0, 0.0, 0.0]) == pytest.approx(1.0)
    assert cosine_similarity(query, [0.0, 1.0, 0.0]) == pytest.approx(0.0)
    assert cosine_similarity(query, [1.0, 1.0, 0.0]) == pytest.approx(2**-0.5)


async def test_ollama_embedding_client_uses_real_batched_api(monkeypatch):
    monkeypatch.setattr(module, "LOCAL_EMBEDDING_BASE_URL", "http://ollama.test")
    monkeypatch.setattr(module, "LOCAL_EMBEDDING_MODEL", "bge-m3")
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "bge-m3:latest"}]})
        body = __import__("json").loads(request.content)
        requests.append(body)
        return httpx.Response(
            200,
            json={"embeddings": [[1.0, float(index)] for index, _ in enumerate(body["input"])]},
        )

    client = OllamaEmbeddingClient(transport=httpx.MockTransport(handler))
    health = await client.health()
    vectors = await client.embed(["条件概率", "贝叶斯"])

    assert health["model_available"] is True
    assert requests[0]["model"] == "bge-m3"
    assert vectors == [[1.0, 0.0], [1.0, 1.0]]
