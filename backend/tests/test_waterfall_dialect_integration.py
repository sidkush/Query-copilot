"""LiveTier consults dialect_bridge when connection dialect != source dialect."""
from unittest.mock import MagicMock, patch


def test_live_tier_transpiles_when_flag_on_and_dialects_differ():
    """When FEATURE_DIALECT_BRIDGE=True and source/target differ, transpile fires."""
    from waterfall_router import _transpile_for_live_tier

    with patch("waterfall_router.settings") as mock_s:
        mock_s.FEATURE_DIALECT_BRIDGE = True
        mock_s.DIALECT_BRIDGE_ALERT_ON_FAILURE = True
        out = _transpile_for_live_tier(
            sql="SELECT COUNTIF(x=1) FROM t",
            source_dialect="bigquery",
            target_dialect="duckdb",
            tenant_id="t1",
        )
    assert "COUNT_IF" in out.upper()


def test_live_tier_passes_through_when_flag_off():
    from waterfall_router import _transpile_for_live_tier

    with patch("waterfall_router.settings") as mock_s:
        mock_s.FEATURE_DIALECT_BRIDGE = False
        out = _transpile_for_live_tier(
            sql="SELECT COUNTIF(x=1) FROM t",
            source_dialect="bigquery",
            target_dialect="duckdb",
            tenant_id="t1",
        )
    assert "COUNTIF" in out.upper()   # no transpile


def test_live_tier_alerts_on_transpile_failure():
    from waterfall_router import _transpile_for_live_tier

    with patch("waterfall_router.settings") as mock_s, \
         patch("waterfall_router.alert_manager") as mock_am:
        mock_s.FEATURE_DIALECT_BRIDGE = True
        mock_s.DIALECT_BRIDGE_ALERT_ON_FAILURE = True
        mock_am.dispatch = MagicMock()
        _transpile_for_live_tier(
            sql="SELECT 1",
            source_dialect="bigquery",
            target_dialect="not_a_dialect",
            tenant_id="t1",
        )
        # Alert must fire since sqlglot raises on unknown dialect -> fallback detected
        mock_am.dispatch.assert_called_once()
        kwargs = mock_am.dispatch.call_args.kwargs
        assert kwargs.get("rule_id") == "transpile_failure"


def test_postgresql_alias_normalized():
    """App uses 'postgresql', sqlglot needs 'postgres' — normalization must happen."""
    from waterfall_router import _transpile_for_live_tier

    with patch("waterfall_router.settings") as mock_s:
        mock_s.FEATURE_DIALECT_BRIDGE = True
        mock_s.DIALECT_BRIDGE_ALERT_ON_FAILURE = False
        # COUNTIF exists in BigQuery, should transpile to COUNT(CASE WHEN ...) on postgres
        out = _transpile_for_live_tier(
            sql="SELECT COUNTIF(x=1) FROM t",
            source_dialect="bigquery",
            target_dialect="postgresql",  # app name — must normalize to 'postgres'
            tenant_id="t1",
        )
    # If normalization failed, sqlglot raises on 'postgresql' -> returns source SQL unchanged
    # If normalization worked, COUNT(CASE WHEN...) or FILTER appears
    assert "COUNTIF" not in out.upper() or out != "SELECT COUNTIF(x=1) FROM t"
    # More specifically: sqlglot must NOT have raised (which would return source unchanged)
    # The transpiled output should not be identical to the source BigQuery SQL
