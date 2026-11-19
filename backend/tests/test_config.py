import pytest
from sqlalchemy.engine import make_url

from src import config


def test_compose_preserves_raw_database_password(monkeypatch):
    password = "example+%/@:#?=$ password"
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("PSA_POSTGRES_HOST", "db")
    monkeypatch.setenv("POSTGRES_USER", "teacher-app")
    monkeypatch.setenv("POSTGRES_PASSWORD", password)
    monkeypatch.setenv("POSTGRES_DB", "school")

    url = make_url(config._database_url())
    assert url.drivername == "postgresql+asyncpg"
    assert url.host == "db"
    assert url.username == "teacher-app"
    assert url.database == "school"
    assert url.password == password


def test_production_rejects_default_secret(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "SECRET_KEY", "dev-secret-change-me-please")
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql+asyncpg://user:pass@db/app")
    monkeypatch.setattr(config, "ALLOWED_ORIGINS", [])

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        config.validate_runtime_config()


def test_production_rejects_sqlite(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "SECRET_KEY", "a-secure-production-secret-with-32-chars")
    monkeypatch.setattr(config, "DATABASE_URL", "sqlite+aiosqlite:///./app.db")
    monkeypatch.setattr(config, "ALLOWED_ORIGINS", [])

    with pytest.raises(RuntimeError, match="PostgreSQL"):
        config.validate_runtime_config()


def test_valid_production_configuration(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "SECRET_KEY", "a-secure-production-secret-with-32-chars")
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql+asyncpg://user:pass@db/app")
    monkeypatch.setattr(config, "ALLOWED_ORIGINS", ["https://example.invalid"])

    config.validate_runtime_config()


def test_production_rejects_enabled_ragflow_without_api_key(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "SECRET_KEY", "a-secure-production-secret-with-32-chars")
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql+asyncpg://user:pass@db/app")
    monkeypatch.setattr(config, "ALLOWED_ORIGINS", ["https://example.invalid"])
    monkeypatch.setattr(config, "KNOWLEDGE_BACKEND", "ragflow")
    monkeypatch.setattr(config, "RAGFLOW_BASE_URL", "https://ragflow.example.invalid")
    monkeypatch.setattr(config, "RAGFLOW_API_KEY", "")

    with pytest.raises(RuntimeError, match="RAGFLOW_API_KEY"):
        config.validate_runtime_config()
