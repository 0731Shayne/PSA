"""Add pluggable local/RAGFlow course material spaces.

Revision ID: 20260801_0005
Revises: 20260724_0004
"""

from alembic import op
import sqlalchemy as sa


revision = "20260801_0005"
down_revision = "20260724_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knowledge_spaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "teacher_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("backend", sa.String(24), nullable=False, server_default="local"),
        sa.Column("provider_dataset_id", sa.String(64), nullable=True, unique=True),
        sa.Column("embedding_model", sa.String(255), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="creating"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_knowledge_spaces_teacher_id", "knowledge_spaces", ["teacher_id"])

    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "space_id",
            sa.Integer(),
            sa.ForeignKey("knowledge_spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider_document_id", sa.String(64), nullable=False, unique=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(128), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("material_type", sa.String(24), nullable=False, server_default="concept"),
        sa.Column("student_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(24), nullable=False, server_default="parsing"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_knowledge_documents_space_id", "knowledge_documents", ["space_id"])

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "document_id",
            sa.Integer(),
            sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding_json", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_knowledge_chunks_document_id", "knowledge_chunks", ["document_id"])

    op.create_table(
        "classroom_knowledge_spaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "classroom_id",
            sa.Integer(),
            sa.ForeignKey("classrooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            sa.Integer(),
            sa.ForeignKey("knowledge_spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("classroom_id", "space_id", name="uq_classroom_knowledge_space"),
    )
    op.create_index(
        "ix_classroom_knowledge_spaces_classroom_id",
        "classroom_knowledge_spaces",
        ["classroom_id"],
    )
    op.create_index(
        "ix_classroom_knowledge_spaces_space_id",
        "classroom_knowledge_spaces",
        ["space_id"],
    )


def downgrade() -> None:
    op.drop_table("classroom_knowledge_spaces")
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_documents")
    op.drop_table("knowledge_spaces")
