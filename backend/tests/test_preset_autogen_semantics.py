# backend/tests/test_preset_autogen_semantics.py
from preset_autogen import _heuristic_pick


CITYBIKES_SCHEMA = {
    "columns": [
        {"name": "ride_id", "dtype": "VARCHAR", "semantic_type": None},
        {"name": "started_at", "dtype": "VARCHAR", "semantic_type": None,
         "sample_values": ["2023-05-01 10:00 UTC"]},
        {"name": "start_lat", "dtype": "FLOAT", "semantic_type": "quantitative"},
        {"name": "start_lng", "dtype": "FLOAT", "semantic_type": "quantitative"},
        {"name": "end_lat", "dtype": "FLOAT", "semantic_type": "quantitative"},
        {"name": "end_lng", "dtype": "FLOAT", "semantic_type": "quantitative"},
        {"name": "start_station_name", "dtype": "VARCHAR", "cardinality": 620},
        {"name": "user_type", "dtype": "VARCHAR", "cardinality": 3},
    ]
}


def test_kpi_heuristic_refuses_to_sum_latitude():
    slot = {"id": "bp.kpi-0", "kind": "kpi"}
    pick = _heuristic_pick(slot, CITYBIKES_SCHEMA, semantic_tags={})
    assert pick["column"] != "start_lat"
    assert pick["column"] != "start_lng"


def test_kpi_heuristic_falls_back_to_count_on_identifier():
    slot = {"id": "bp.kpi-0", "kind": "kpi"}
    pick = _heuristic_pick(slot, CITYBIKES_SCHEMA, semantic_tags={})
    # When no safe numeric measure exists, pick COUNT(ride_id)
    assert pick["agg"].upper() in {"COUNT", "COUNT_DISTINCT"}
    assert pick["column"] == "ride_id"


def test_table_heuristic_uses_entity_name_not_geo():
    slot = {"id": "bp.accounts-list", "kind": "table"}
    pick = _heuristic_pick(slot, CITYBIKES_SCHEMA, semantic_tags={})
    assert pick["dimension"] == "start_station_name"


def test_chart_heuristic_picks_string_temporal():
    slot = {"id": "bp.trend-chart", "kind": "chart"}
    pick = _heuristic_pick(slot, CITYBIKES_SCHEMA, semantic_tags={})
    assert pick["primary_date"] == "started_at"
