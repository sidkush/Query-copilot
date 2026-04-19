# backend/tests/test_schema_semantics.py
import pytest
from schema_semantics import classify_column, forbid_for_agg, digest_with_semantics


def _col(name, dtype="FLOAT", semantic_type=None, cardinality=None, samples=None):
    return {
        "name": name,
        "dtype": dtype,
        "semantic_type": semantic_type,
        "cardinality": cardinality,
        "sample_values": samples or [],
    }


class TestClassifyColumn:
    def test_latitude_is_geo_and_forbids_sum_avg(self):
        tags = classify_column(_col("start_lat", "FLOAT"))
        assert "geo" in tags.roles
        assert tags.forbid_aggs == {"SUM", "AVG"}
        assert tags.prefer_aggs == set()

    def test_longitude_is_geo(self):
        assert "geo" in classify_column(_col("start_lng", "FLOAT")).roles

    def test_identifier_column_prefers_count(self):
        tags = classify_column(_col("ride_id", "VARCHAR"))
        assert "identifier" in tags.roles
        assert tags.forbid_aggs == {"SUM", "AVG"}
        assert "COUNT" in tags.prefer_aggs
        assert "COUNT_DISTINCT" in tags.prefer_aggs

    def test_trailing_id_suffix_is_identifier(self):
        assert "identifier" in classify_column(_col("start_station_id", "INT64")).roles

    def test_temporal_string_recognised(self):
        tags = classify_column(_col("started_at", "VARCHAR", samples=["2023-05-01 10:00 UTC"]))
        assert "temporal" in tags.roles
        assert tags.is_temporal_string is True

    def test_true_numeric_measure(self):
        tags = classify_column(_col("duration_sec", "INT64"))
        assert "measure" in tags.roles
        assert tags.forbid_aggs == set()

    def test_high_cardinality_string_is_entity_name(self):
        tags = classify_column(_col("start_station_name", "VARCHAR", cardinality=600))
        assert "entity_name" in tags.roles
        assert "dimension" in tags.roles

    def test_low_cardinality_string_is_dimension_only(self):
        tags = classify_column(_col("user_type", "VARCHAR", cardinality=3))
        assert "dimension" in tags.roles
        assert "entity_name" not in tags.roles


class TestForbidForAgg:
    def test_forbid_sum_on_geo(self):
        tags = classify_column(_col("start_lat", "FLOAT"))
        assert forbid_for_agg(tags, "SUM") is True
        assert forbid_for_agg(tags, "COUNT") is False

    def test_allow_sum_on_measure(self):
        tags = classify_column(_col("duration_sec", "INT64"))
        assert forbid_for_agg(tags, "SUM") is False


class TestDigestWithSemantics:
    def test_digest_lists_roles_and_rejection_notes(self):
        profile = {"columns": [
            _col("ride_id", "VARCHAR"),
            _col("start_lat", "FLOAT"),
            _col("duration_sec", "INT64"),
        ]}
        out = digest_with_semantics(profile)
        assert "ride_id" in out
        assert "identifier" in out
        assert "DO NOT SUM" in out or "forbid" in out.lower()
        assert "start_lat" in out
        assert "geo" in out
        assert "duration_sec" in out
        assert "measure" in out
