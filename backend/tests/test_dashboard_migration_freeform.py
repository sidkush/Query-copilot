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
