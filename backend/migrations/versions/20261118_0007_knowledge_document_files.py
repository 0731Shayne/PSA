"""Keep original course files with their owning documents."""

from alembic import op
import sqlalchemy as sa

revision = "20261118_0007"
down_revision = "20260910_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knowledge_document_files",
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("content", sa.LargeBinary(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("knowledge_document_files")
