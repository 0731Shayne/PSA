"""Permission-aware course material retrieval for tutoring."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import KNOWLEDGE_BACKEND, RAGFLOW_RETRIEVAL_PAGE_SIZE
from ..db.models import (
    Classroom,
    ClassroomKnowledgeSpace,
    ClassroomMembership,
    KnowledgeDocument,
    KnowledgeSpace,
    User,
)
from ..integrations.ragflow_client import RAGFlowClient, RAGFlowError, RetrievedMaterial
from ..integrations.local_knowledge import LocalKnowledgeError, retrieve_local_materials


logger = logging.getLogger(__name__)


async def accessible_documents(
    db: AsyncSession,
    user: User,
    *,
    guidance_mode: str,
) -> list[KnowledgeDocument]:
    """Return only documents the current user may contribute to a tutor response."""

    query = (
        select(KnowledgeDocument)
        .join(KnowledgeSpace, KnowledgeSpace.id == KnowledgeDocument.space_id)
        .where(KnowledgeSpace.status == "ready", KnowledgeDocument.status == "ready")
    )
    if user.role == "teacher":
        query = query.where(KnowledgeSpace.teacher_id == user.id)
    else:
        query = (
            query.join(
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
                KnowledgeDocument.student_visible.is_(True),
            )
        )
    # Hints and staged guidance must never retrieve complete worked solutions,
    # even for a teacher previewing the student experience.
    if guidance_mode != "full":
        query = query.where(KnowledgeDocument.material_type.notin_(("solution", "teacher_only")))
    elif user.role != "teacher":
        query = query.where(KnowledgeDocument.material_type != "teacher_only")
    return list((await db.execute(query.distinct())).scalars().all())


async def retrieve_course_materials(
    db: AsyncSession,
    user: User,
    question: str,
    *,
    guidance_mode: str,
) -> list[dict[str, Any]]:
    """Retrieve evidence without making the tutor depend on RAGFlow availability."""

    if KNOWLEDGE_BACKEND == "disabled":
        return []
    documents = await accessible_documents(db, user, guidance_mode=guidance_mode)
    if not documents:
        return []
    spaces = {
        space.id: space for space in (
            await db.scalars(select(KnowledgeSpace).where(
                KnowledgeSpace.id.in_({document.space_id for document in documents})
            ))
        ).all()
    }
    local_documents = [
        document for document in documents
        if document.space_id in spaces and spaces[document.space_id].backend == "local"
    ]
    sources: list[dict[str, Any]] = []
    if local_documents and KNOWLEDGE_BACKEND == "local":
        try:
            sources.extend(await retrieve_local_materials(db, question, local_documents))
        except LocalKnowledgeError as exc:
            logger.warning("Local embedding retrieval unavailable: %s", exc)
        except Exception:
            logger.exception("Unexpected local knowledge retrieval failure")
    if KNOWLEDGE_BACKEND == "ragflow":
        dataset_ids: set[str] = set()
        names: dict[str, str] = {}
        for document in documents:
            space = spaces.get(document.space_id)
            if space and space.backend == "ragflow" and space.provider_dataset_id:
                dataset_ids.add(space.provider_dataset_id)
                names[document.provider_document_id] = document.filename
        try:
            results = await RAGFlowClient().retrieve(
                question,
                dataset_ids=sorted(dataset_ids),
                document_ids=list(names),
            )
            sources.extend(
                _material_source(item, names[item.document_id])
                for item in results
                if item.document_id in names
            )
        except RAGFlowError as exc:
            logger.warning("RAGFlow retrieval unavailable: %s", exc)
        except Exception:
            # Course retrieval is optional. A malformed upstream response or
            # integration regression must not take the core tutor down.
            logger.exception("Unexpected RAGFlow retrieval failure")
    sources.sort(key=lambda source: float(source.get("similarity") or 0), reverse=True)
    return sources[:RAGFLOW_RETRIEVAL_PAGE_SIZE]


def _material_source(
    material: RetrievedMaterial,
    filename: str,
) -> dict[str, Any]:
    source = material.as_source()
    source["document_name"] = filename
    source["backend"] = "ragflow"
    return source


def material_context_text(sources: list[dict[str, Any]]) -> str:
    """Render bounded, clearly untrusted evidence for the tutor prompt."""

    blocks: list[str] = []
    for index, source in enumerate(sources, start=1):
        content = str(source.get("content") or "").strip()
        if not content:
            continue
        blocks.append(
            f"【课程资料 {index}｜{source.get('document_name') or '未命名资料'}】\n{content[:6000]}"
        )
    return "\n\n".join(blocks)
