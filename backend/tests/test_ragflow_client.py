import json

import httpx
import pytest

from src.integrations import ragflow_client as module
from src.integrations.ragflow_client import RAGFlowClient, RAGFlowError, normalize_document_status


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(module, "RAGFLOW_API_KEY", "test-key")
    monkeypatch.setattr(module, "RAGFLOW_BASE_URL", "https://ragflow.test")


async def test_ragflow_client_creates_uploads_parses_and_retrieves(configured):
    requests: list[tuple[str, str, bytes]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path, request.content))
        assert request.headers["Authorization"] == "Bearer test-key"
        if request.url.path == "/api/v1/datasets" and request.method == "POST":
            return httpx.Response(200, json={"code": 0, "data": {"id": "dataset-1"}})
        if request.url.path.endswith("/documents") and request.method == "POST":
            assert "multipart/form-data" in request.headers["Content-Type"]
            return httpx.Response(
                200,
                json={"code": 0, "data": [{"id": "document-1", "name": "讲义.pdf"}]},
            )
        if request.url.path.endswith("/chunks"):
            assert json.loads(request.content)["document_ids"] == ["document-1"]
            return httpx.Response(200, json={"code": 0, "data": True})
        if request.url.path == "/api/v1/retrieval":
            body = json.loads(request.content)
            assert body["dataset_ids"] == ["dataset-1"]
            assert body["document_ids"] == ["document-1"]
            return httpx.Response(
                200,
                json={
                    "code": 0,
                    "data": {
                        "chunks": [
                            {
                                "id": "chunk-1",
                                "document_id": "document-1",
                                "document_keyword": "讲义.pdf",
                                "content": "条件概率定义",
                                "similarity": 0.82,
                            }
                        ]
                    },
                },
            )
        raise AssertionError(f"unexpected request: {request.method} {request.url.path}")

    client = RAGFlowClient(transport=httpx.MockTransport(handler))
    client.enabled = True
    dataset = await client.create_dataset("课程资料")
    document = await client.upload_document(
        dataset["id"],
        filename="讲义.pdf",
        content=b"pdf-bytes",
        content_type="application/pdf",
    )
    await client.parse_documents(dataset["id"], [document["id"]])
    chunks = await client.retrieve(
        "什么是条件概率？", dataset_ids=[dataset["id"]], document_ids=[document["id"]]
    )

    assert chunks[0].document_name == "讲义.pdf"
    assert chunks[0].content == "条件概率定义"
    assert chunks[0].similarity == pytest.approx(0.82)
    assert [item[1] for item in requests] == [
        "/api/v1/datasets",
        "/api/v1/datasets/dataset-1/documents",
        "/api/v1/datasets/dataset-1/chunks",
        "/api/v1/retrieval",
    ]


async def test_ragflow_client_converts_remote_errors_to_safe_error(configured):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"code": 101, "message": "dataset denied"})

    client = RAGFlowClient(transport=httpx.MockTransport(handler))
    client.enabled = True
    with pytest.raises(RAGFlowError, match="dataset denied"):
        await client.create_dataset("无权限资料")


async def test_ragflow_client_tolerates_malformed_similarity(configured):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {
                    "chunks": [
                        {
                            "id": "chunk-1",
                            "document_id": "document-1",
                            "content": "合法文本",
                            "similarity": "not-a-number",
                        }
                    ]
                },
            },
        )

    client = RAGFlowClient(transport=httpx.MockTransport(handler))
    client.enabled = True
    materials = await client.retrieve("问题", dataset_ids=["dataset-1"], document_ids=["document-1"])
    assert materials[0].similarity == 0.0


async def test_list_documents_fetches_all_pages(configured):
    pages = []

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        pages.append(page)
        return httpx.Response(200, json={
            "code": 0,
            "data": {"docs": [{"id": f"document-{page}"}], "total_datasets": 2},
        })

    client = RAGFlowClient(transport=httpx.MockTransport(handler))
    client.enabled = True
    assert await client.list_documents("dataset-1") == [
        {"id": "document-1"}, {"id": "document-2"},
    ]
    assert pages == [1, 2]


async def test_list_documents_rejects_incomplete_snapshot(configured):
    def handler(request: httpx.Request) -> httpx.Response:
        docs = [{"id": "document-1"}] if request.url.params["page"] == "1" else []
        return httpx.Response(200, json={
            "code": 0,
            "data": {"docs": docs, "total_datasets": 2},
        })

    client = RAGFlowClient(transport=httpx.MockTransport(handler))
    client.enabled = True
    with pytest.raises(RAGFlowError, match="文档列表不完整"):
        await client.list_documents("dataset-1")


@pytest.mark.parametrize(
    ("remote", "expected"),
    [(0, "pending"), (1, "parsing"), (3, "ready"), (4, "failed"), (5, "pending"), ("SCHEDULE", "pending"), ("DONE", "ready")],
)
def test_normalize_document_status(remote, expected):
    assert normalize_document_status(remote) == expected
