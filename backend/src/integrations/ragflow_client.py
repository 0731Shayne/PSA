"""Small, typed boundary around the RAGFlow HTTP API.

PSA owns users, classrooms, permissions and pedagogy. RAGFlow only receives
teacher-approved course material and returns retrieval evidence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from ..config import (
    RAGFLOW_API_KEY,
    RAGFLOW_BASE_URL,
    RAGFLOW_CHUNK_METHOD,
    RAGFLOW_EMBEDDING_MODEL,
    RAGFLOW_ENABLED,
    RAGFLOW_RERANK_ID,
    RAGFLOW_RETRIEVAL_PAGE_SIZE,
    RAGFLOW_SIMILARITY_THRESHOLD,
    RAGFLOW_TIMEOUT_SECONDS,
    RAGFLOW_TOP_K,
    RAGFLOW_USE_ENV_PROXY,
    RAGFLOW_VECTOR_SIMILARITY_WEIGHT,
    RAGFLOW_VERIFY_SSL,
)


class RAGFlowError(RuntimeError):
    """A safe integration error that does not expose credentials or response bodies."""


@dataclass(frozen=True)
class RetrievedMaterial:
    chunk_id: str
    document_id: str
    document_name: str
    content: str
    similarity: float
    vector_similarity: float | None = None
    term_similarity: float | None = None
    positions: list[Any] | None = None

    def as_source(self) -> dict[str, Any]:
        return {
            "kind": "material",
            "id": self.chunk_id,
            "document_id": self.document_id,
            "document_name": self.document_name,
            "content": self.content,
            "similarity": self.similarity,
            "positions": self.positions or [],
        }


class RAGFlowClient:
    """Async RAGFlow client with bounded timeouts and response validation."""

    def __init__(self, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.enabled = RAGFLOW_ENABLED
        self._transport = transport

    def _ensure_enabled(self) -> None:
        if not self.enabled:
            raise RAGFlowError("课程资料库尚未启用")
        if not RAGFLOW_API_KEY:
            raise RAGFlowError("课程资料库服务尚未配置")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        files: list[tuple[str, tuple[str, bytes, str]]] | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        self._ensure_enabled()
        headers = {"Authorization": f"Bearer {RAGFLOW_API_KEY}"}
        try:
            async with httpx.AsyncClient(
                base_url=RAGFLOW_BASE_URL,
                headers=headers,
                timeout=RAGFLOW_TIMEOUT_SECONDS,
                verify=RAGFLOW_VERIFY_SSL,
                trust_env=RAGFLOW_USE_ENV_PROXY,
                transport=self._transport,
            ) as client:
                response = await client.request(method, path, json=json, files=files, params=params)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RAGFlowError("课程资料服务连接失败") from exc
        if not isinstance(payload, dict):
            raise RAGFlowError("课程资料服务返回了无效响应")
        code = payload.get("code", 0)
        if code not in (0, None):
            message = str(payload.get("message") or "课程资料服务请求失败")
            raise RAGFlowError(message[:300])
        return payload.get("data")

    async def health(self) -> bool:
        await self._request("GET", "/api/v1/datasets", params={"page": 1, "page_size": 1})
        return True

    async def create_dataset(self, name: str, description: str = "") -> dict[str, Any]:
        body: dict[str, Any] = {
            "name": name,
            "description": description,
            "permission": "me",
            "chunk_method": RAGFLOW_CHUNK_METHOD,
        }
        if RAGFLOW_EMBEDDING_MODEL:
            body["embedding_model"] = RAGFLOW_EMBEDDING_MODEL
        data = await self._request("POST", "/api/v1/datasets", json=body)
        if not isinstance(data, dict) or not data.get("id"):
            raise RAGFlowError("课程资料服务未返回知识库标识")
        return data

    async def delete_dataset(self, dataset_id: str) -> None:
        await self._request("DELETE", "/api/v1/datasets", json={"ids": [dataset_id]})

    async def upload_document(
        self,
        dataset_id: str,
        *,
        filename: str,
        content: bytes,
        content_type: str,
    ) -> dict[str, Any]:
        data = await self._request(
            "POST",
            f"/api/v1/datasets/{dataset_id}/documents",
            files=[("file", (filename, content, content_type))],
        )
        first = data[0] if isinstance(data, list) and data else None
        if not isinstance(first, dict) or not first.get("id"):
            raise RAGFlowError("课程资料服务未返回文档标识")
        return first

    async def parse_documents(self, dataset_id: str, document_ids: list[str]) -> None:
        await self._request(
            "POST",
            f"/api/v1/datasets/{dataset_id}/chunks",
            json={"document_ids": document_ids},
        )

    async def list_documents(self, dataset_id: str) -> list[dict[str, Any]]:
        data = await self._request(
            "GET",
            f"/api/v1/datasets/{dataset_id}/documents",
            params={"page": 1, "page_size": 1000, "orderby": "create_time", "desc": "true"},
        )
        if isinstance(data, dict):
            docs = data.get("docs", [])
        else:
            docs = data or []
        return [item for item in docs if isinstance(item, dict)]

    async def delete_documents(self, dataset_id: str, document_ids: list[str]) -> None:
        await self._request(
            "DELETE",
            f"/api/v1/datasets/{dataset_id}/documents",
            json={"ids": document_ids},
        )

    async def retrieve(self, question: str, document_ids: list[str]) -> list[RetrievedMaterial]:
        if not document_ids:
            return []
        body: dict[str, Any] = {
            "question": question,
            "document_ids": document_ids,
            "page": 1,
            "page_size": RAGFLOW_RETRIEVAL_PAGE_SIZE,
            "similarity_threshold": RAGFLOW_SIMILARITY_THRESHOLD,
            "vector_similarity_weight": RAGFLOW_VECTOR_SIMILARITY_WEIGHT,
            "top_k": RAGFLOW_TOP_K,
            "keyword": True,
            "highlight": False,
        }
        if RAGFLOW_RERANK_ID:
            body["rerank_id"] = RAGFLOW_RERANK_ID
        data = await self._request("POST", "/api/v1/retrieval", json=body)
        chunks = data.get("chunks", []) if isinstance(data, dict) else []
        materials: list[RetrievedMaterial] = []
        for item in chunks:
            if not isinstance(item, dict):
                continue
            content = str(item.get("content") or "").strip()
            if not content:
                continue
            materials.append(
                RetrievedMaterial(
                    chunk_id=str(item.get("id") or ""),
                    document_id=str(item.get("document_id") or ""),
                    document_name=str(
                        item.get("document_keyword") or item.get("doc_name") or "课程资料"
                    ),
                    content=content[:8000],
                    similarity=_safe_float(item.get("similarity")) or 0.0,
                    vector_similarity=_safe_float(item.get("vector_similarity")),
                    term_similarity=_safe_float(item.get("term_similarity")),
                    positions=item.get("positions") if isinstance(item.get("positions"), list) else [],
                )
            )
        return materials


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_document_status(value: Any) -> str:
    """Map RAGFlow numeric/text run values to PSA's stable public statuses."""

    normalized = str(value if value is not None else "").strip().upper()
    return {
        "0": "pending",
        "UNSTART": "pending",
        "1": "parsing",
        "RUNNING": "parsing",
        "2": "cancelled",
        "CANCEL": "cancelled",
        "3": "ready",
        "DONE": "ready",
        "4": "failed",
        "FAIL": "failed",
    }.get(normalized, "unknown")
