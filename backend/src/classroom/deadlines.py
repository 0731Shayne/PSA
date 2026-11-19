from datetime import datetime, timezone


def deadline_utc(value: datetime | None) -> datetime | None:
    """SQLite returns UTC timestamps without timezone information."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
