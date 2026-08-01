"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
import hashlib
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "sqlite+aiosqlite:///./teaching_assistant.db"
).strip()
_configured_secret = os.environ.get("SECRET_KEY", "dev-secret-change-me-please")
# Development may inherit an old short local secret. Derive a stable 32-byte
# value to avoid weak-key warnings without weakening production validation.
SECRET_KEY = (
    _configured_secret
    if IS_PRODUCTION or len(_configured_secret) >= 32
    else hashlib.sha256(f"mra-development-only:{_configured_secret}".encode()).hexdigest()
)
TEACHER_REGISTRATION_CODE = os.environ.get("TEACHER_REGISTRATION_CODE", "").strip()


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


_legacy_ragflow_enabled = _env_flag("RAGFLOW_ENABLED")
KNOWLEDGE_BACKEND = os.environ.get(
    "KNOWLEDGE_BACKEND",
    "ragflow" if _legacy_ragflow_enabled else ("disabled" if IS_PRODUCTION else "local"),
).strip().lower()
if KNOWLEDGE_BACKEND not in {"disabled", "local", "ragflow"}:
    raise RuntimeError("KNOWLEDGE_BACKEND 必须是 disabled、local 或 ragflow")
RAGFLOW_ENABLED = KNOWLEDGE_BACKEND == "ragflow"
RAGFLOW_BASE_URL = os.environ.get("RAGFLOW_BASE_URL", "http://localhost:9380").strip().rstrip("/")
RAGFLOW_API_KEY = os.environ.get("RAGFLOW_API_KEY", "").strip()
RAGFLOW_TIMEOUT_SECONDS = max(5.0, float(os.environ.get("RAGFLOW_TIMEOUT_SECONDS", "30")))
RAGFLOW_VERIFY_SSL = _env_flag("RAGFLOW_VERIFY_SSL", True)
RAGFLOW_USE_ENV_PROXY = _env_flag("RAGFLOW_USE_ENV_PROXY")
RAGFLOW_EMBEDDING_MODEL = os.environ.get("RAGFLOW_EMBEDDING_MODEL", "").strip()
RAGFLOW_RERANK_ID = os.environ.get("RAGFLOW_RERANK_ID", "").strip()
RAGFLOW_CHUNK_METHOD = os.environ.get("RAGFLOW_CHUNK_METHOD", "book").strip() or "book"
RAGFLOW_MAX_FILE_BYTES = max(1, int(os.environ.get("RAGFLOW_MAX_FILE_MB", "50"))) * 1024 * 1024
RAGFLOW_RETRIEVAL_PAGE_SIZE = max(1, min(int(os.environ.get("RAGFLOW_RETRIEVAL_PAGE_SIZE", "6")), 20))
RAGFLOW_SIMILARITY_THRESHOLD = min(1.0, max(0.0, float(os.environ.get("RAGFLOW_SIMILARITY_THRESHOLD", "0.2"))))
RAGFLOW_VECTOR_SIMILARITY_WEIGHT = min(1.0, max(0.0, float(os.environ.get("RAGFLOW_VECTOR_SIMILARITY_WEIGHT", "0.5"))))
RAGFLOW_TOP_K = max(1, min(int(os.environ.get("RAGFLOW_TOP_K", "256")), 4096))
LOCAL_EMBEDDING_BASE_URL = (
    os.environ.get("LOCAL_EMBEDDING_BASE_URL", "http://localhost:11434").strip().rstrip("/")
)
LOCAL_EMBEDDING_MODEL = os.environ.get("LOCAL_EMBEDDING_MODEL", "bge-m3").strip() or "bge-m3"
LOCAL_EMBEDDING_TIMEOUT_SECONDS = max(
    5.0,
    float(os.environ.get("LOCAL_EMBEDDING_TIMEOUT_SECONDS", "60")),
)
LOCAL_EMBEDDING_USE_ENV_PROXY = _env_flag("LOCAL_EMBEDDING_USE_ENV_PROXY")
LOCAL_CHUNK_SIZE = max(300, min(int(os.environ.get("LOCAL_CHUNK_SIZE", "900")), 4000))
LOCAL_CHUNK_OVERLAP = max(
    0,
    min(int(os.environ.get("LOCAL_CHUNK_OVERLAP", "120")), LOCAL_CHUNK_SIZE // 2),
)
LOCAL_EMBEDDING_BATCH_SIZE = max(
    1,
    min(int(os.environ.get("LOCAL_EMBEDDING_BATCH_SIZE", "16")), 64),
)


def _csv_env(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


ALLOWED_ORIGINS = _csv_env(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173" if not IS_PRODUCTION else "",
)


def validate_runtime_config() -> None:
    """Fail fast when production is started with unsafe configuration."""

    if not IS_PRODUCTION:
        return
    if len(SECRET_KEY) < 32 or SECRET_KEY in {
        "dev-secret-change-me-please",
        "replace-with-at-least-32-random-characters",
    }:
        raise RuntimeError("生产环境必须配置至少 32 个字符的 SECRET_KEY")
    if not DATABASE_URL.startswith("postgresql+asyncpg://"):
        raise RuntimeError("生产环境必须使用 PostgreSQL DATABASE_URL")
    if "*" in ALLOWED_ORIGINS:
        raise RuntimeError("生产环境的 ALLOWED_ORIGINS 不能使用通配符 *")
    if KNOWLEDGE_BACKEND == "ragflow" and (
        not RAGFLOW_BASE_URL.startswith(("http://", "https://"))
        or not RAGFLOW_API_KEY
        or RAGFLOW_API_KEY.startswith("replace-")
    ):
        raise RuntimeError("启用 RAGFlow 时必须配置有效的 RAGFLOW_BASE_URL 和 RAGFLOW_API_KEY")
    if KNOWLEDGE_BACKEND == "local" and not LOCAL_EMBEDDING_BASE_URL.startswith(
        ("http://", "https://")
    ):
        raise RuntimeError("本地知识库必须配置有效的 LOCAL_EMBEDDING_BASE_URL")
