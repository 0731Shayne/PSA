"""Add auditable learning evidence and account session controls.

Revision ID: 20260809_0005
Revises: 20260724_0004
"""

from alembic import op
import sqlalchemy as sa


revision = "20260809_0005"
down_revision = "20260724_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("session_version", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("must_change_password", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False))

    with op.batch_alter_table("learning_assignments") as batch_op:
        batch_op.add_column(sa.Column("hint_policy", sa.String(24), server_default="allowed", nullable=False))
        batch_op.add_column(sa.Column("transfer_question_id", sa.String(16), nullable=True))

    with op.batch_alter_table("question_attempts") as batch_op:
        batch_op.add_column(sa.Column("submitted_late", sa.Boolean(), server_default=sa.false(), nullable=False))

    op.create_table(
        "hint_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("assignment_id", sa.Integer(), nullable=True),
        sa.Column("question_id", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["learning_assignments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hint_events_user_id"), "hint_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_hint_events_assignment_id"), "hint_events", ["assignment_id"], unique=False)
    op.create_index(op.f("ix_hint_events_question_id"), "hint_events", ["question_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_hint_events_question_id"), table_name="hint_events")
    op.drop_index(op.f("ix_hint_events_assignment_id"), table_name="hint_events")
    op.drop_index(op.f("ix_hint_events_user_id"), table_name="hint_events")
    op.drop_table("hint_events")

    with op.batch_alter_table("question_attempts") as batch_op:
        batch_op.drop_column("submitted_late")
    with op.batch_alter_table("learning_assignments") as batch_op:
        batch_op.drop_column("transfer_question_id")
        batch_op.drop_column("hint_policy")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("is_active")
        batch_op.drop_column("must_change_password")
        batch_op.drop_column("session_version")
