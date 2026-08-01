"""Teacher-facing APIs for local-vector and RAGFlow course materials."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.handler import get_current_user
from ..config import (
    KNOWLEDGE_BACKEND,
    LOCAL_CHUNK_SIZE,
    LOCAL_EMBEDDING_MODEL,
    RAGFLOW_CHUNK_METHOD,
    RAGFLOW_EMBEDDING_MODEL,
    RAGFLOW_MAX_FILE_BYTES,
)
from ..db.models import (
    Classroom,
    ClassroomKnowledgeSpace,
    ClassroomMembership,
    KnowledgeDocument,
    KnowledgeSpace,
    User,
)
from ..db.session import get_db
from ..integrations.local_knowledge import (
    LOCAL_EXTENSIONS,
    LocalKnowledgeError,
    OllamaEmbeddingClient,
    extract_document_text,
    index_local_document,
)
from ..integrations.ragflow_client import RAGFlowClient, RAGFlowError, normalize_document_status


router = APIRouter()
ALLOWED_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".txt",
    ".md",
    ".html",
    ".htm",
}


def _active_extensions() -> set[str]:
    return LOCAL_EXTENSIONS if KNOWLEDGE_BACKEND == "local" else ALLOWED_EXTENSIONS


class KnowledgeSpaceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=4000)


class KnowledgeSpaceUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=4000)


def _require_teacher(user: User) -> None:
    if user.role != "teacher":
        raise HTTPException(status_code=403, detail="仅教师可以管理课程资料库")


async def _owned_space(db: AsyncSession, space_id: int, teacher_id: int) -> KnowledgeSpace:
    space = (
        await db.execute(
            select(KnowledgeSpace).where(
                KnowledgeSpace.id == space_id,
                KnowledgeSpace.teacher_id == teacher_id,
            )
        )
    ).scalar_one_or_none()
    if space is None:
        raise HTTPException(status_code=404, detail="课程资料库不存在")
    return space


async def _owned_document(
    db: AsyncSession,
    document_id: int,
    teacher_id: int,
) -> tuple[KnowledgeDocument, KnowledgeSpace]:
    row = (
        await db.execute(
            select(KnowledgeDocument, KnowledgeSpace)
            .join(KnowledgeSpace, KnowledgeSpace.id == KnowledgeDocument.space_id)
            .where(
                KnowledgeDocument.id == document_id,
                KnowledgeSpace.teacher_id == teacher_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="课程资料不存在")
    return row


def _document_payload(document: KnowledgeDocument) -> dict[str, Any]:
    return {
        "id": document.id,
        "filename": document.filename,
        "mime_type": document.mime_type,
        "size_bytes": document.size_bytes,
        "material_type": document.material_type,
        "student_visible": document.student_visible,
        "status": document.status,
        "last_error": document.last_error,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
    }


async def _space_payload(db: AsyncSession, space: KnowledgeSpace) -> dict[str, Any]:
    documents = list(
        (
            await db.execute(
                select(KnowledgeDocument)
                .where(KnowledgeDocument.space_id == space.id)
                .order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id.desc())
            )
        ).scalars().all()
    )
    classroom_ids = list(
        (
            await db.execute(
                select(ClassroomKnowledgeSpace.classroom_id).where(
                    ClassroomKnowledgeSpace.space_id == space.id
                )
            )
        ).scalars().all()
    )
    return {
        "id": space.id,
        "name": space.name,
        "description": space.description or "",
        "status": space.status,
        "last_error": space.last_error,
        "backend": space.backend,
        "embedding_model": space.embedding_model,
        "classroom_ids": classroom_ids,
        "documents": [_document_payload(item) for item in documents],
        "created_at": space.created_at.isoformat() if space.created_at else None,
        "updated_at": space.updated_at.isoformat() if space.updated_at else None,
    }


@router.get("/knowledge/config")
async def knowledge_config(user: User = Depends(get_current_user)):
    return {
        "enabled": KNOWLEDGE_BACKEND != "disabled",
        "backend": KNOWLEDGE_BACKEND,
        "teacher": user.role == "teacher",
        "embedding_model": (
            LOCAL_EMBEDDING_MODEL
            if KNOWLEDGE_BACKEND == "local"
            else RAGFLOW_EMBEDDING_MODEL or "由 RAGFlow 系统默认值决定"
        ),
        "chunk_method": (
            f"local-overlap-{LOCAL_CHUNK_SIZE}"
            if KNOWLEDGE_BACKEND == "local"
            else RAGFLOW_CHUNK_METHOD
        ),
        "max_file_mb": RAGFLOW_MAX_FILE_BYTES // (1024 * 1024),
        "allowed_extensions": sorted(_active_extensions()),
    }


@router.get("/knowledge/health")
async def knowledge_health(user: User = Depends(get_current_user)):
    _require_teacher(user)
    if KNOWLEDGE_BACKEND == "disabled":
        return {"enabled": False, "reachable": False, "detail": "课程资料库尚未启用"}
    if KNOWLEDGE_BACKEND == "local":
        try:
            health = await OllamaEmbeddingClient().health()
        except LocalKnowledgeError as exc:
            return {"enabled": True, "backend": "local", "reachable": False, "detail": str(exc)}
        if not health["model_available"]:
            return {
                "enabled": True,
                "backend": "local",
                "reachable": False,
                "detail": f"Ollama 已连接，但尚未安装 {LOCAL_EMBEDDING_MODEL}",
            }
        return {
            "enabled": True,
            "backend": "local",
            "reachable": True,
            "detail": f"本地 {LOCAL_EMBEDDING_MODEL} Embedding 可用",
        }
    try:
        await RAGFlowClient().health()
    except RAGFlowError as exc:
        return {"enabled": True, "reachable": False, "detail": str(exc)}
    return {"enabled": True, "backend": "ragflow", "reachable": True, "detail": "RAGFlow 连接正常"}


@router.get("/knowledge/spaces")
async def list_knowledge_spaces(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role == "teacher":
        query = select(KnowledgeSpace).where(KnowledgeSpace.teacher_id == user.id)
    else:
        query = (
            select(KnowledgeSpace)
            .join(
                ClassroomKnowledgeSpace,
                ClassroomKnowledgeSpace.space_id == KnowledgeSpace.id,
            )
            .join(Classroom, Classroom.id == ClassroomKnowledgeSpace.classroom_id)
            .join(
                ClassroomMembership,
                ClassroomMembership.classroom_id == Classroom.id,
            )
            .where(
                ClassroomMembership.student_id == user.id,
                Classroom.status == "active",
                KnowledgeSpace.status == "ready",
            )
            .distinct()
        )
    spaces = list(
        (
            await db.execute(query.order_by(KnowledgeSpace.updated_at.desc(), KnowledgeSpace.id.desc()))
        ).scalars().all()
    )
    payloads = [await _space_payload(db, item) for item in spaces]
    if user.role != "teacher":
        for payload in payloads:
            payload["classroom_ids"] = []
            payload["last_error"] = None
            payload["documents"] = [
                {**item, "last_error": None}
                for item in payload["documents"]
                if item["student_visible"]
                and item["material_type"] != "teacher_only"
                and item["status"] == "ready"
            ]
    return payloads


@router.post("/knowledge/spaces")
async def create_knowledge_space(
    payload: KnowledgeSpaceCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    if KNOWLEDGE_BACKEND == "disabled":
        raise HTTPException(status_code=503, detail="课程资料库尚未启用")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="请输入资料库名称")
    space = KnowledgeSpace(
        teacher_id=user.id,
        name=name,
        description=payload.description.strip() or None,
        backend=KNOWLEDGE_BACKEND,
        embedding_model=(
            LOCAL_EMBEDDING_MODEL
            if KNOWLEDGE_BACKEND == "local"
            else RAGFLOW_EMBEDDING_MODEL or None
        ),
        status="creating",
    )
    db.add(space)
    await db.commit()
    await db.refresh(space)
    if KNOWLEDGE_BACKEND == "local":
        space.provider_dataset_id = f"local-space-{uuid4().hex}"
        space.status = "ready"
        await db.commit()
        await db.refresh(space)
        return await _space_payload(db, space)
    try:
        remote = await RAGFlowClient().create_dataset(
            f"PSA-{user.id}-{name[:80]}-{uuid4().hex[:8]}",
            payload.description.strip(),
        )
        space.provider_dataset_id = str(remote["id"])
        space.embedding_model = str(remote.get("embedding_model") or RAGFLOW_EMBEDDING_MODEL or "") or None
        space.status = "ready"
        space.last_error = None
        await db.commit()
    except RAGFlowError as exc:
        space.status = "failed"
        space.last_error = str(exc)
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    await db.refresh(space)
    return await _space_payload(db, space)


@router.post("/knowledge/spaces/{space_id}/retry")
async def retry_knowledge_space(
    space_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    if KNOWLEDGE_BACKEND == "disabled":
        raise HTTPException(status_code=503, detail="课程资料库尚未启用")
    space = await _owned_space(db, space_id, user.id)
    if space.backend != KNOWLEDGE_BACKEND:
        raise HTTPException(
            status_code=409,
            detail=f"该资料库使用 {space.backend} 后端，当前启用的是 {KNOWLEDGE_BACKEND}",
        )
    if space.backend == "local":
        space.provider_dataset_id = space.provider_dataset_id or f"local-space-{uuid4().hex}"
        space.embedding_model = LOCAL_EMBEDDING_MODEL
        space.status = "ready"
        space.last_error = None
        await db.commit()
        return await _space_payload(db, space)
    if space.provider_dataset_id:
        space.status = "ready"
        space.last_error = None
        await db.commit()
        return await _space_payload(db, space)
    try:
        remote = await RAGFlowClient().create_dataset(
            f"PSA-{user.id}-{space.name[:80]}-{uuid4().hex[:8]}",
            space.description or "",
        )
    except RAGFlowError as exc:
        space.status = "failed"
        space.last_error = str(exc)
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    space.provider_dataset_id = str(remote["id"])
    space.embedding_model = str(remote.get("embedding_model") or RAGFLOW_EMBEDDING_MODEL or "") or None
    space.status = "ready"
    space.last_error = None
    await db.commit()
    return await _space_payload(db, space)


@router.patch("/knowledge/spaces/{space_id}")
async def update_knowledge_space(
    space_id: int,
    payload: KnowledgeSpaceUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    space = await _owned_space(db, space_id, user.id)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="请输入资料库名称")
        space.name = name
    if payload.description is not None:
        space.description = payload.description.strip() or None
    await db.commit()
    return await _space_payload(db, space)


@router.delete("/knowledge/spaces/{space_id}")
async def delete_knowledge_space(
    space_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    space = await _owned_space(db, space_id, user.id)
    if space.backend == "ragflow" and space.provider_dataset_id:
        try:
            await RAGFlowClient().delete_dataset(space.provider_dataset_id)
        except RAGFlowError as exc:
            raise HTTPException(status_code=502, detail=f"远端资料删除失败：{exc}") from exc
    await db.delete(space)
    await db.commit()
    return {"deleted": True}


@router.put("/knowledge/spaces/{space_id}/classrooms/{classroom_id}")
async def bind_knowledge_space(
    space_id: int,
    classroom_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    await _owned_space(db, space_id, user.id)
    classroom = (
        await db.execute(
            select(Classroom).where(
                Classroom.id == classroom_id,
                Classroom.teacher_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if classroom is None:
        raise HTTPException(status_code=404, detail="班级不存在")
    db.add(ClassroomKnowledgeSpace(classroom_id=classroom_id, space_id=space_id))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
    return {"bound": True}


@router.delete("/knowledge/spaces/{space_id}/classrooms/{classroom_id}")
async def unbind_knowledge_space(
    space_id: int,
    classroom_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    await _owned_space(db, space_id, user.id)
    await db.execute(
        delete(ClassroomKnowledgeSpace).where(
            ClassroomKnowledgeSpace.space_id == space_id,
            ClassroomKnowledgeSpace.classroom_id == classroom_id,
        )
    )
    await db.commit()
    return {"bound": False}


@router.post("/knowledge/spaces/{space_id}/documents")
async def upload_knowledge_document(
    space_id: int,
    file: UploadFile = File(...),
    material_type: Literal["concept", "example", "solution", "teacher_only"] = Form("concept"),
    student_visible: bool = Form(True),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    space = await _owned_space(db, space_id, user.id)
    if space.backend != KNOWLEDGE_BACKEND:
        raise HTTPException(
            status_code=409,
            detail=f"该资料库使用 {space.backend} 后端，当前启用的是 {KNOWLEDGE_BACKEND}",
        )
    if space.status != "ready" or not space.provider_dataset_id:
        raise HTTPException(status_code=409, detail="资料库尚未就绪")
    filename = Path(file.filename or "").name.strip()
    if not filename or Path(filename).suffix.lower() not in _active_extensions():
        raise HTTPException(status_code=400, detail="不支持该文件类型")
    if len(filename) > 255:
        raise HTTPException(status_code=400, detail="文件名不能超过 255 个字符")
    content_type = file.content_type or "application/octet-stream"
    content = await file.read(RAGFLOW_MAX_FILE_BYTES + 1)
    await file.close()
    if not content:
        raise HTTPException(status_code=400, detail="不能上传空文件")
    if len(content) > RAGFLOW_MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"文件不能超过 {RAGFLOW_MAX_FILE_BYTES // (1024 * 1024)} MB",
        )
    if space.backend == "local":
        try:
            extracted_text = extract_document_text(filename, content)
        except LocalKnowledgeError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        document = KnowledgeDocument(
            space_id=space.id,
            provider_document_id=f"local-document-{uuid4().hex}",
            filename=filename,
            mime_type=content_type,
            size_bytes=len(content),
            material_type=material_type,
            student_visible=student_visible and material_type != "teacher_only",
            status="parsing",
            extracted_text=extracted_text,
        )
        db.add(document)
        await db.commit()
        await db.refresh(document)
        try:
            await index_local_document(db, document)
        except LocalKnowledgeError as exc:
            document.status = "failed"
            document.last_error = str(exc)
            await db.commit()
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return _document_payload(document)
    try:
        remote = await RAGFlowClient().upload_document(
            space.provider_dataset_id,
            filename=filename,
            content=content,
            content_type=content_type,
        )
    except RAGFlowError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    document = KnowledgeDocument(
        space_id=space.id,
        provider_document_id=str(remote["id"]),
        filename=str(remote.get("name") or filename),
        mime_type=content_type,
        size_bytes=len(content),
        material_type=material_type,
        student_visible=student_visible and material_type != "teacher_only",
        status="parsing",
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    try:
        await RAGFlowClient().parse_documents(
            space.provider_dataset_id,
            [document.provider_document_id],
        )
    except RAGFlowError as exc:
        document.status = "failed"
        document.last_error = str(exc)
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return _document_payload(document)


@router.post("/knowledge/spaces/{space_id}/refresh")
async def refresh_knowledge_documents(
    space_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    space = await _owned_space(db, space_id, user.id)
    if not space.provider_dataset_id:
        raise HTTPException(status_code=409, detail="资料库尚未创建成功")
    if space.backend == "local":
        return await _space_payload(db, space)
    try:
        remote_documents = await RAGFlowClient().list_documents(space.provider_dataset_id)
    except RAGFlowError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    remote_by_id = {str(item.get("id")): item for item in remote_documents}
    local_documents = list(
        (
            await db.execute(
                select(KnowledgeDocument).where(KnowledgeDocument.space_id == space.id)
            )
        ).scalars().all()
    )
    for document in local_documents:
        remote = remote_by_id.get(document.provider_document_id)
        if remote is None:
            document.status = "missing"
            document.last_error = "RAGFlow 中已找不到该文档"
            continue
        document.status = normalize_document_status(remote.get("run"))
        document.last_error = (
            str(remote.get("progress_msg") or "")[:1000] or None
            if document.status in {"failed", "cancelled", "unknown"}
            else None
        )
    await db.commit()
    return await _space_payload(db, space)


@router.post("/knowledge/documents/{document_id}/retry")
async def retry_knowledge_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    document, space = await _owned_document(db, document_id, user.id)
    if space.backend != KNOWLEDGE_BACKEND:
        raise HTTPException(
            status_code=409,
            detail=f"该资料库使用 {space.backend} 后端，当前启用的是 {KNOWLEDGE_BACKEND}",
        )
    if not space.provider_dataset_id:
        raise HTTPException(status_code=409, detail="资料库尚未就绪")
    if space.backend == "local":
        document.status = "parsing"
        document.last_error = None
        await db.commit()
        try:
            await index_local_document(db, document)
        except LocalKnowledgeError as exc:
            document.status = "failed"
            document.last_error = str(exc)
            await db.commit()
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return _document_payload(document)
    try:
        await RAGFlowClient().parse_documents(
            space.provider_dataset_id,
            [document.provider_document_id],
        )
    except RAGFlowError as exc:
        document.status = "failed"
        document.last_error = str(exc)
        await db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    document.status = "parsing"
    document.last_error = None
    await db.commit()
    return _document_payload(document)


@router.delete("/knowledge/documents/{document_id}")
async def delete_knowledge_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(user)
    document, space = await _owned_document(db, document_id, user.id)
    if space.backend == "ragflow" and space.provider_dataset_id:
        try:
            await RAGFlowClient().delete_documents(
                space.provider_dataset_id,
                [document.provider_document_id],
            )
        except RAGFlowError as exc:
            raise HTTPException(status_code=502, detail=f"远端资料删除失败：{exc}") from exc
    await db.delete(document)
    await db.commit()
    return {"deleted": True}
