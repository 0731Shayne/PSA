"""Conservative, structure-preserving comparisons; never evaluate user code."""
import re
from fractions import Fraction

GRADING_VERSION = "diagnostic-v3"


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


def _option_labels(value: str) -> set[str] | None:
    labels = re.split(r"\s*[,，、]\s*", value.upper())
    if len(set(labels)) != len(labels) or not all(re.fullmatch(r"[A-Z]|\(\d+\)", label) for label in labels):
        return None
    return set(labels)


def compare_question_answers(answer: str, standard: str, qtype: str, choices: list[str] | None) -> bool | None:
    left, right = canonical_answer(answer), canonical_answer(standard)
    if qtype == "判断题":
        judgments = {"正确": True, "成立": True, "错误": False, "不成立": False}
        expected = re.match(r"^(?:命题)?(正确|错误|不成立|成立)(?=$|[。.!！])", right)
        if left in judgments and expected:
            return judgments[left] == judgments[expected[1]]
    if qtype in {"单选题", "多选题"} and choices:
        labels = {
            (prefix[1] or prefix[2]).upper() for choice in choices
            if (prefix := re.match(r"^\s*(?:(\(\d+\))|([A-Z])(?:[.．、)]|\s|$))", choice, re.I))
        }
        selected, expected = _option_labels(left), _option_labels(right)
        if selected and expected and selected <= labels and expected <= labels:
            if qtype == "多选题" or (len(selected) == 1 and len(expected) == 1):
                return selected == expected
    return compare_answers(answer, standard)
