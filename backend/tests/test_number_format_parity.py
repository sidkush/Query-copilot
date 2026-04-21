"""Plan 10b — parity golden-fixture harness. Shared with TS tests."""
import json
from pathlib import Path

import pytest

from vizql.number_format import format_number, parse_number_format

FIXTURE = Path(__file__).parent.parent / "vizql" / "tests" / "fixtures" / "number_format_parity" / "cases.json"


@pytest.fixture(scope="module")
def cases():
    assert FIXTURE.exists(), f"fixture missing at {FIXTURE}"
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert len(data) >= 200, f"need >= 200 cases, got {len(data)}"
    return data


def test_parity_cases(cases):
    failures = []
    for case in cases:
        ast = parse_number_format(case["pattern"])
        got = format_number(case["value"], ast, locale=case.get("locale", "en-US"))
        if got != case["expected"]:
            failures.append(
                f"[{case['id']}] pattern={case['pattern']!r} value={case['value']!r} "
                f"expected={case['expected']!r} got={got!r}"
            )
    assert not failures, "parity failures:\n" + "\n".join(failures[:20])
