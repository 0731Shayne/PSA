import json
from itertools import count

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.auth.handler import create_token
from src.db.models import User
from src.db.session import Base, get_db
from src.integrations.llm_client import LLMClient
from src.integrations.local_knowledge import OllamaEmbeddingClient
from src.integrations.ragflow_client import RAGFlowClient, RetrievedMaterial
from src.knowledge.service import accessible_documents, retrieve_course_materials
from src.main import app


@pytest_asyncio.fixture
async def knowledge_api(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'knowledge.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        users = [
            User(username="knowledge-teacher", name="陈老师", role="teacher"),
            User(username="other-teacher", name="林老师", role="teacher"),
            User(username="knowledge-student", name="小周", role="student"),
            User(username="outside-student", name="小吴", role="student"),
        ]
        db.add_all(users)
        await db.commit()
        for user in users:
            await db.refresh(user)

    remote_ids = count(1)
    remote_documents: dict[str, dict] = {}

    async def create_dataset(_client, name, description=""):
        return {"id": "dataset-1", "name": name, "description": description, "embedding_model": "BAAI/bge-m3"}

    async def upload_document(_client, _dataset_id, *, filename, content, content_type):
        document_id = f"remote-{next(remote_ids)}"
        remote_documents[document_id] = {"id": document_id, "name": filename, "run": 1}
        return {"id": document_id, "name": filename, "size": len(content), "type": content_type}

    async def parse_documents(_client, _dataset_id, document_ids):
        for document_id in document_ids:
            remote_documents[document_id]["run"] = 3

    async def list_documents(_client, _dataset_id):
        return list(remote_documents.values())

    async def delete_documents(_client, _dataset_id, document_ids):
        for document_id in document_ids:
            remote_documents.pop(document_id, None)

    async def delete_dataset(_client, _dataset_id):
        remote_documents.clear()

    monkeypatch.setattr("src.knowledge.handler.KNOWLEDGE_BACKEND", "ragflow")
    monkeypatch.setattr(RAGFlowClient, "create_dataset", create_dataset)
    monkeypatch.setattr(RAGFlowClient, "upload_document", upload_document)
    monkeypatch.setattr(RAGFlowClient, "parse_documents", parse_documents)
    monkeypatch.setattr(RAGFlowClient, "list_documents", list_documents)
    monkeypatch.setattr(RAGFlowClient, "delete_documents", delete_documents)
    monkeypatch.setattr(RAGFlowClient, "delete_dataset", delete_dataset)

    async def override_db():
        async with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client:
        yield {
            "client": client,
            "sessions": sessions,
            "teacher": users[0],
            "other_teacher": users[1],
            "student": users[2],
            "outsider": users[3],
            "teacher_headers": {"Authorization": f"Bearer {create_token(users[0].id)}"},
            "other_teacher_headers": {"Authorization": f"Bearer {create_token(users[1].id)}"},
            "student_headers": {"Authorization": f"Bearer {create_token(users[2].id)}"},
            "outsider_headers": {"Authorization": f"Bearer {create_token(users[3].id)}"},
        }
    app.dependency_overrides.clear()
    await engine.dispose()


async def _upload(client, headers, space_id, filename, material_type, student_visible=True):
    return await client.post(
        f"/api/knowledge/spaces/{space_id}/documents",
        headers=headers,
        files={"file": (filename, b"course-material", "application/pdf")},
        data={"material_type": material_type, "student_visible": str(student_visible).lower()},
    )


async def test_teacher_manages_spaces_and_student_permissions_are_fail_closed(knowledge_api):
    client = knowledge_api["client"]
    teacher_headers = knowledge_api["teacher_headers"]
    student_headers = knowledge_api["student_headers"]

    classroom = (
        await client.post("/api/classrooms", json={"name": "概率一班"}, headers=teacher_headers)
    ).json()
    joined = await client.post(
        "/api/classrooms/join",
        json={"join_code": classroom["join_code"]},
        headers=student_headers,
    )
    assert joined.status_code == 200

    created = await client.post(
        "/api/knowledge/spaces",
        json={"name": "第一章讲义", "description": "条件概率"},
        headers=teacher_headers,
    )
    assert created.status_code == 200
    space = created.json()

    assert (
        await client.post(
            "/api/knowledge/spaces",
            json={"name": "越权资料"},
            headers=student_headers,
        )
    ).status_code == 403
    assert (
        await client.put(
            f"/api/knowledge/spaces/{space['id']}/classrooms/{classroom['id']}",
            headers=knowledge_api["other_teacher_headers"],
        )
    ).status_code == 404

    bound = await client.put(
        f"/api/knowledge/spaces/{space['id']}/classrooms/{classroom['id']}",
        headers=teacher_headers,
    )
    assert bound.status_code == 200
    concept = await _upload(client, teacher_headers, space["id"], "概念.pdf", "concept")
    solution = await _upload(client, teacher_headers, space["id"], "解答.pdf", "solution")
    private = await _upload(
        client,
        teacher_headers,
        space["id"],
        "教师备注.pdf",
        "teacher_only",
        student_visible=True,
    )
    assert concept.status_code == solution.status_code == private.status_code == 200
    refreshed = await client.post(
        f"/api/knowledge/spaces/{space['id']}/refresh", headers=teacher_headers
    )
    assert refreshed.status_code == 200
    assert all(item["status"] == "ready" for item in refreshed.json()["documents"])

    student_spaces = (await client.get("/api/knowledge/spaces", headers=student_headers)).json()
    assert student_spaces[0]["classroom_ids"] == []
    assert student_spaces[0]["last_error"] is None
    assert {item["filename"] for item in student_spaces[0]["documents"]} == {"概念.pdf", "解答.pdf"}
    assert (
        await client.get("/api/knowledge/spaces", headers=knowledge_api["outsider_headers"])
    ).json() == []

    async with knowledge_api["sessions"]() as db:
        hint_documents = await accessible_documents(
            db,
            knowledge_api["student"],
            guidance_mode="hint",
        )
        full_documents = await accessible_documents(
            db,
            knowledge_api["student"],
            guidance_mode="full",
        )
    assert {item.filename for item in hint_documents} == {"概念.pdf"}
    assert {item.filename for item in full_documents} == {"概念.pdf", "解答.pdf"}


async def test_retrieval_sends_only_authorized_document_ids(knowledge_api, monkeypatch):
    client = knowledge_api["client"]
    teacher_headers = knowledge_api["teacher_headers"]
    student_headers = knowledge_api["student_headers"]
    classroom = (
        await client.post("/api/classrooms", json={"name": "检索权限班"}, headers=teacher_headers)
    ).json()
    await client.post(
        "/api/classrooms/join",
        json={"join_code": classroom["join_code"]},
        headers=student_headers,
    )
    space = (
        await client.post(
            "/api/knowledge/spaces",
            json={"name": "检索验证"},
            headers=teacher_headers,
        )
    ).json()
    await client.put(
        f"/api/knowledge/spaces/{space['id']}/classrooms/{classroom['id']}",
        headers=teacher_headers,
    )
    concept = (await _upload(client, teacher_headers, space["id"], "概念.pdf", "concept")).json()
    await _upload(client, teacher_headers, space["id"], "教师.pdf", "teacher_only")
    await client.post(f"/api/knowledge/spaces/{space['id']}/refresh", headers=teacher_headers)

    captured: list[str] = []

    async def retrieve(_client, _question, document_ids):
        captured.extend(document_ids)
        return [
            RetrievedMaterial(
                chunk_id="chunk-1",
                document_id=document_ids[0],
                document_name="remote-name",
                content="条件概率定义",
                similarity=0.9,
            )
        ]

    monkeypatch.setattr("src.knowledge.service.KNOWLEDGE_BACKEND", "ragflow")
    monkeypatch.setattr(RAGFlowClient, "retrieve", retrieve)
    async with knowledge_api["sessions"]() as db:
        sources = await retrieve_course_materials(
            db,
            knowledge_api["student"],
            "条件概率是什么",
            guidance_mode="hint",
        )
    assert len(captured) == 1
    assert sources[0]["document_id"] == captured[0]
    assert sources[0]["document_name"] == "概念.pdf"
    assert all("教师" not in source["document_name"] for source in sources)


async def test_tutor_persists_material_citations_and_has_safe_fallback(knowledge_api, monkeypatch):
    async def material_retrieval(*_args, **_kwargs):
        return [
            {
                "kind": "material",
                "id": "chunk-safe",
                "document_id": "document-safe",
                "document_name": "课程讲义.pdf",
                "content": "条件概率定义为 P(A|B)=P(AB)/P(B)。",
                "similarity": 0.91,
                "positions": [],
            }
        ]

    async def unavailable(*_args, **_kwargs):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr("src.question_bank.handler.retrieve_context", lambda *_args, **_kwargs: [])
    monkeypatch.setattr("src.question_bank.handler.retrieve_course_materials", material_retrieval)
    monkeypatch.setattr(LLMClient, "chat", unavailable)
    response = await knowledge_api["client"].post(
        "/api/question-bank/assistant",
        json={"message": "条件概率是什么？", "guidance_mode": "full"},
        headers=knowledge_api["student_headers"],
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["sources"][0]["kind"] == "material"
    assert payload["sources"][0]["document_name"] == "课程讲义.pdf"
    assert "课程讲义.pdf" in payload["answer"]
    assert payload["model"] == "question-bank-fallback"

    async def unavailable_stream(*_args, **_kwargs):
        raise RuntimeError("stream unavailable")
        yield ""  # pragma: no cover - keeps this function an async generator

    monkeypatch.setattr(LLMClient, "stream_chat", unavailable_stream)
    streamed = await knowledge_api["client"].post(
        "/api/question-bank/assistant/stream",
        json={"message": "继续说明条件概率", "guidance_mode": "full"},
        headers=knowledge_api["student_headers"],
    )
    assert streamed.status_code == 200
    events = [json.loads(line) for line in streamed.text.splitlines()]
    assert events[0]["event"] == "meta"
    assert events[0]["data"]["sources"][0]["kind"] == "material"
    assert any("课程讲义.pdf" in str(event["data"]) for event in events if event["event"] == "delta")
    assert events[-1] == {"event": "done", "data": {"model": "question-bank-fallback"}}


async def test_local_backend_uploads_embeds_retrieves_and_cites_markdown(
    knowledge_api,
    monkeypatch,
):
    monkeypatch.setattr("src.knowledge.handler.KNOWLEDGE_BACKEND", "local")
    monkeypatch.setattr("src.knowledge.service.KNOWLEDGE_BACKEND", "local")

    async def fake_embed(_client, texts):
        return [
            [1.0, 0.0, 0.0]
            if "条件概率" in text
            else [0.0, 1.0, 0.0]
            for text in texts
        ]

    async def unavailable(*_args, **_kwargs):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(OllamaEmbeddingClient, "embed", fake_embed)
    monkeypatch.setattr(LLMClient, "chat", unavailable)
    client = knowledge_api["client"]
    teacher_headers = knowledge_api["teacher_headers"]
    student_headers = knowledge_api["student_headers"]

    classroom = (
        await client.post("/api/classrooms", json={"name": "本地向量班"}, headers=teacher_headers)
    ).json()
    await client.post(
        "/api/classrooms/join",
        json={"join_code": classroom["join_code"]},
        headers=student_headers,
    )
    space_response = await client.post(
        "/api/knowledge/spaces",
        json={"name": "本地 Embedding 演示"},
        headers=teacher_headers,
    )
    assert space_response.status_code == 200
    space = space_response.json()
    assert space["backend"] == "local"
    await client.put(
        f"/api/knowledge/spaces/{space['id']}/classrooms/{classroom['id']}",
        headers=teacher_headers,
    )
    uploaded = await client.post(
        f"/api/knowledge/spaces/{space['id']}/documents",
        headers=teacher_headers,
        files={
            "file": (
                "条件概率.md",
                "# 条件概率\n\n条件概率定义为 P(A|B)=P(AB)/P(B)。".encode(),
                "text/markdown",
            )
        },
        data={"material_type": "concept", "student_visible": "true"},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["status"] == "ready"

    response = await client.post(
        "/api/question-bank/assistant",
        json={"message": "条件概率如何计算？", "guidance_mode": "full"},
        headers=student_headers,
    )
    assert response.status_code == 200
    material_sources = [
        source for source in response.json()["sources"] if source.get("kind") == "material"
    ]
    assert material_sources[0]["backend"] == "local"
    assert material_sources[0]["document_name"] == "条件概率.md"
    assert material_sources[0]["similarity"] == pytest.approx(1.0)
