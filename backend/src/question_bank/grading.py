"""Conservative, structure-preserving comparisons; never evaluate user code."""
import re
from fractions import Fraction

GRADING_VERSION = "diagnostic-v2"


def canonical_answer(value: str) -> str:
    value = value.strip()
    for left, right in (("$$", "$$"), ("$", "$"), (r"\(", r"\)"), (r"\[", r"\]")):
        if value.startswith(left) and value.endswith(right):
            value = value[len(left):-len(right)].strip()
            break
    return re.sub(r"\s+", " ", value)


def _number(value: str) -> Fraction | None:
    number = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)"
    match = re.fullmatch(r"\\(?:dfrac|tfrac|frac)\s*\{\s*(" + number + r")\s*\}\s*\{\s*(" + number + r")\s*\}", value)
    if not match:
        match = re.fullmatch(r"(" + number + r")\s*/\s*(" + number + r")", value)
    try:
        if match:
            return Fraction(match[1]) / Fraction(match[2])
        if re.fullmatch(number, value):
            return Fraction(value)
    except (ValueError, ZeroDivisionError):
        pass
    return None


def compare_answers(answer: str, standard: str) -> bool | None:
    """None means unsupported, not wrong. Case, braces and punctuation are semantic."""
    left, right = canonical_answer(answer), canonical_answer(standard)
    if not left or not right:
        return None
    a, b = _number(left), _number(right)
    if a is not None and b is not None:
        return a == b
    if left == right:
        return True
    return None
