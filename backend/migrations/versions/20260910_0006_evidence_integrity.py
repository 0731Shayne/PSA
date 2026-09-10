"""Preserve mathematical and independent evidence integrity."""
from alembic import op
import sqlalchemy as sa

revision = "20260910_0006"
down_revision = "20260809_0005"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("question_attempts") as batch:
        batch.add_column(sa.Column("request_key", sa.String(64), nullable=True))
        batch.add_column(sa.Column("request_hash", sa.String(64), nullable=True))
        batch.add_column(sa.Column("independent_eligible", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch.add_column(sa.Column("grading_source", sa.String(64), nullable=True))
        batch.add_column(sa.Column("grading_version", sa.String(32), nullable=True))
        batch.create_unique_constraint("uq_attempt_request", ["user_id", "request_key"])
    op.create_index("uq_first_independent_attempt", "question_attempts", ["user_id", "question_id"], unique=True,
        sqlite_where=sa.text("independent_eligible = true"), postgresql_where=sa.text("independent_eligible = true"))
    with op.batch_alter_table("experiment_records") as batch:
        batch.add_column(sa.Column("seed", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("algorithm_version", sa.String(32), nullable=True))
    op.create_table("learning_support_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.String(16), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_learning_support_events_user_id", "learning_support_events", ["user_id"])
    op.create_index("ix_learning_support_events_question_id", "learning_support_events", ["question_id"])


def downgrade():
    op.drop_index("uq_first_independent_attempt", table_name="question_attempts")
    op.drop_table("learning_support_events")
    with op.batch_alter_table("experiment_records") as batch:
        batch.drop_column("algorithm_version")
        batch.drop_column("seed")
    with op.batch_alter_table("question_attempts") as batch:
        batch.drop_constraint("uq_attempt_request", type_="unique")
        for name in ("grading_version", "grading_source", "independent_eligible", "request_hash", "request_key"):
            batch.drop_column(name)
