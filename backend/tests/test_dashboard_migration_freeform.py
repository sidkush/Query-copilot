"""Tests for dashboard_migration.legacy_to_freeform_schema.

Includes Plan 3 T9 additions: actions persistence round-trip tests.
"""
from dashboard_migration import legacy_to_freeform_schema


def test_flat_tile_list_becomes_vert_container():
    legacy = {
        "id": "d1",
        "name": "Test",
        "tiles": [
            {"id": "t1", "chart_spec": {"mark": "bar"}},
            {"id": "t2", "chart_spec": {"mark": "line"}},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    assert result["schemaVersion"] == "askdb/dashboard/v1"
    assert result["archetype"] == "analyst-pro"
    assert result["tiledRoot"]["type"] == "container-vert"
    assert len(result["tiledRoot"]["children"]) == 2
    assert result["tiledRoot"]["children"][0]["worksheetRef"] == "t1"
    assert result["tiledRoot"]["children"][1]["worksheetRef"] == "t2"


def test_children_h_values_sum_100000():
    legacy = {"id": "d1", "name": "Test", "tiles": [{"id": "t1"}, {"id": "t2"}, {"id": "t3"}]}
    result = legacy_to_freeform_schema(legacy)
    total = sum(c["h"] for c in result["tiledRoot"]["children"])
    assert total == 100000, f"children h values sum to {total}, expected 100000"


def test_empty_tile_list_produces_empty_root():
    legacy = {"id": "d1", "name": "Empty", "tiles": []}
    result = legacy_to_freeform_schema(legacy)
    assert result["tiledRoot"]["children"] == []


def test_worksheets_array_populated():
    legacy = {
        "id": "d1",
        "name": "T",
        "tiles": [{"id": "t1", "chart_spec": {"mark": "bar"}, "sql": "SELECT 1"}],
    }
    result = legacy_to_freeform_schema(legacy)
    assert len(result["worksheets"]) == 1
    assert result["worksheets"][0]["id"] == "t1"
    assert result["worksheets"][0]["chartSpec"] == {"mark": "bar"}


def test_sections_tree_flattens_to_vert_of_horz():
    legacy = {
        "id": "d1",
        "name": "T",
        "sections": [
            {"id": "s1", "tiles": [{"id": "a"}, {"id": "b"}]},
            {"id": "s2", "tiles": [{"id": "c"}]},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    root = result["tiledRoot"]
    assert root["type"] == "container-vert"
    assert len(root["children"]) == 2
    assert root["children"][0]["type"] == "container-horz"
    assert len(root["children"][0]["children"]) == 2
    assert root["children"][1]["type"] == "container-horz"
    assert len(root["children"][1]["children"]) == 1


# ── Plan 3 T9: actions persistence round-trip ───────────────────────────────


def test_actions_preserved_in_migration():
    """legacy_to_freeform_schema must carry over an existing actions list verbatim."""
    action = {
        "id": "a1",
        "name": "Keep Me",
        "kind": "filter",
        "enabled": True,
        "sourceSheets": ["s1"],
        "targetSheets": ["s2"],
        "fieldMapping": [{"source": "week", "target": "week"}],
        "clearBehavior": "show-all",
        "trigger": "select",
    }
    legacy = {
        "id": "d1",
        "name": "T",
        "tiles": [{"id": "t1"}],
        "actions": [action],
    }
    result = legacy_to_freeform_schema(legacy)
    assert len(result["actions"]) == 1, "actions list should have 1 entry"
    assert result["actions"][0]["id"] == "a1"
    assert result["actions"][0]["name"] == "Keep Me"


def test_actions_default_empty_list_in_migration():
    """When legacy dict has no 'actions' key, output actions must be []."""
    legacy = {"id": "d1", "name": "T", "tiles": [{"id": "t1"}]}
    result = legacy_to_freeform_schema(legacy)
    assert result["actions"] == [], f"Expected [], got {result['actions']}"


def test_actions_non_list_value_coerced_to_empty():
    """If legacy 'actions' is not a list (e.g. None or a string), coerce to []."""
    legacy = {"id": "d1", "name": "T", "tiles": [], "actions": None}
    result = legacy_to_freeform_schema(legacy)
    assert result["actions"] == []

    legacy2 = {"id": "d2", "name": "T", "tiles": [], "actions": "bad"}
    result2 = legacy_to_freeform_schema(legacy2)
    assert result2["actions"] == []


def test_multiple_actions_all_preserved():
    """All actions in the input list survive migration, order preserved."""
    actions = [
        {"id": "act-1", "kind": "filter", "name": "First"},
        {"id": "act-2", "kind": "url", "name": "Second"},
    ]
    legacy = {"id": "d1", "name": "T", "tiles": [], "actions": actions}
    result = legacy_to_freeform_schema(legacy)
    assert len(result["actions"]) == 2
    assert result["actions"][0]["id"] == "act-1"
    assert result["actions"][1]["id"] == "act-2"


# -- Plan 4e: edge-case regression tests ---------------------------------


def test_4e_a_zero_height_widget_coerced_to_minimum():
    """Widgets with h=0 get clamped to MIN_PROPORTION, and children still sum to 100000."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [
            {"id": "t1", "h": 0},
            {"id": "t2", "h": 50000},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    kids = result["tiledRoot"]["children"]
    assert kids[0]["h"] >= 1000, "zero-h must be clamped to >= MIN_PROPORTION"
    assert sum(c["h"] for c in kids) == 100000


def test_4e_b_overlapping_widgets_go_to_floating_layer():
    """Tiles carrying x/y/w/h become floating zones; other tiles stay tiled."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [
            {"id": "tiled", "chart_spec": {"mark": "bar"}},
            {"id": "floaty", "x": 40, "y": 60, "w": 300, "h": 200},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    assert len(result["floatingLayer"]) == 1
    assert result["floatingLayer"][0]["id"] == "floaty"
    assert result["floatingLayer"][0]["x"] == 40
    assert result["floatingLayer"][0]["y"] == 60
    assert result["floatingLayer"][0]["floating"] is True
    assert len(result["tiledRoot"]["children"]) == 1
    assert result["tiledRoot"]["children"][0]["id"] == "tiled"


def test_4e_c_title_only_widget_becomes_worksheet_with_displayname():
    """A tile with no chart_spec / sql / type but a title yields a worksheet zone
    whose displayName equals the title."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [{"id": "t1", "title": "Section Header"}],
    }
    result = legacy_to_freeform_schema(legacy)
    kid = result["tiledRoot"]["children"][0]
    assert kid["displayName"] == "Section Header"
    assert result["worksheets"][0]["displayName"] == "Section Header"


def test_4e_d_corrupt_widget_skipped_with_warning(caplog):
    """Tiles missing id are skipped and a warning is logged."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [
            {"id": "good", "chart_spec": {"mark": "bar"}},
            {"chart_spec": {"mark": "line"}},  # no id -> corrupt
        ],
    }
    with caplog.at_level("WARNING"):
        result = legacy_to_freeform_schema(legacy)
    assert any("corrupt tile" in rec.message for rec in caplog.records)
    ids = [c["id"] for c in result["tiledRoot"]["children"]]
    assert ids == ["good"]


def test_4e_e_unknown_widget_type_becomes_blank():
    """Unknown legacy tile type falls back to a blank zone; displayName preserved."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [{"id": "t1", "type": "qr-code", "title": "Scan Me"}],
    }
    result = legacy_to_freeform_schema(legacy)
    kid = result["tiledRoot"]["children"][0]
    assert kid["type"] == "blank"
    assert kid["displayName"] == "Scan Me"


def test_4e_f_displayname_and_locked_round_trip():
    """Plan-2b fields on input are preserved verbatim."""
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [
            {"id": "t1", "chart_spec": {"mark": "bar"},
             "displayName": "Revenue Pulse", "locked": True},
        ],
    }
    result = legacy_to_freeform_schema(legacy)
    kid = result["tiledRoot"]["children"][0]
    assert kid["displayName"] == "Revenue Pulse"
    assert kid["locked"] is True


def test_4e_h_sets_and_parameters_preserved_when_present():
    """Plan-4b sets and Plan-4c parameters carry through migration verbatim."""
    sets = [{"id": "s1", "name": "Top 10", "members": [1, 2, 3]}]
    parameters = [{"id": "p1", "name": "year", "type": "integer", "value": 2026}]
    legacy = {
        "id": "d1", "name": "T",
        "tiles": [{"id": "t1"}],
        "sets": sets,
        "parameters": parameters,
    }
    result = legacy_to_freeform_schema(legacy)
    assert result["sets"] == sets
    assert result["parameters"] == parameters


def test_4e_h_sets_and_parameters_default_empty_when_absent():
    """Graceful defaults when those keys are missing."""
    legacy = {"id": "d1", "name": "T", "tiles": [{"id": "t1"}]}
    result = legacy_to_freeform_schema(legacy)
    assert result["sets"] == []
    assert result["parameters"] == []
