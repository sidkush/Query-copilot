"""Clause inventory — LLM extraction + AST validation."""
from clause_inventory import (
    Clause, ClauseInventory, extract_clauses, validate_mapping,
)


def _mock_extractor(nl: str):
    if "casual riders churning" in nl:
        return [
            Clause(text="casual riders", kind="cohort_filter"),
            Clause(text="churning within 30 days", kind="metric"),
            Clause(text="by station", kind="groupby"),
        ]
    return []


def test_extract_clauses_via_injected_callable():
    clauses = extract_clauses(
        nl="why are casual riders churning within 30 days by station",
        llm_fn=_mock_extractor,
    )
    assert len(clauses) == 3
    kinds = {c.kind for c in clauses}
    assert "cohort_filter" in kinds


def test_validate_mapping_detects_unmapped_groupby():
    clauses = [
        Clause(text="casual riders", kind="cohort_filter"),
        Clause(text="by station", kind="groupby"),
    ]
    sql = "SELECT user_id FROM trips WHERE rider_type = 'casual'"
    unmapped = validate_mapping(clauses, sql, dialect="sqlite")
    assert any(u.kind == "groupby" for u in unmapped)


def test_validate_mapping_empty_when_all_clauses_covered():
    clauses = [
        Clause(text="casual riders", kind="cohort_filter"),
        Clause(text="by station", kind="groupby"),
    ]
    sql = """
    SELECT station_id, COUNT(*) FROM trips
    WHERE rider_type = 'casual'
    GROUP BY station_id
    """
    unmapped = validate_mapping(clauses, sql, dialect="sqlite")
    assert unmapped == []


def test_clause_inventory_dataclass_fields():
    inv = ClauseInventory(
        extracted=[Clause(text="x", kind="metric")],
        unmapped=[],
        sql="SELECT 1",
    )
    assert inv.extracted[0].text == "x"
    assert inv.sql == "SELECT 1"
