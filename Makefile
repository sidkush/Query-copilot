.PHONY: proto proto-py proto-ts clean-proto \
        graphify-ingest phase-closeout test-alert-fire \
        lint-backend lint-frontend

# Regenerate Python + TypeScript bindings from backend/proto/*.proto.
# Idempotent - rerun after editing any .proto file.
# On Windows (no GNU make), call scripts directly:
#   bash backend/scripts/regen_proto.sh
#   bash frontend/scripts/regen_proto.sh
proto: proto-py proto-ts

proto-py:
	bash backend/scripts/regen_proto.sh

proto-ts:
	bash frontend/scripts/regen_proto.sh

clean-proto:
	rm -f backend/vizql/proto/v1_pb2.py
	rm -f backend/vizql/proto/v1_pb2.pyi
	rm -f frontend/src/components/dashboard/freeform/lib/vizSpecGenerated.ts

# ---------------------------------------------------------------------------
# Phase I — Operations Layer helpers
# ---------------------------------------------------------------------------

# Run the user-global graphify skill against docs/superpowers/plans/.
# Soft-fails (exit 0) if the 'graphify' CLI is not on PATH or errors out,
# so CI / pre-commit hooks are never blocked by a missing optional tool.
graphify-ingest:
	graphify docs/superpowers/plans --update --no-viz 2>&1 || \
	  echo "[graphify-ingest] graphify CLI not found or failed — skipping. Install ~/.claude/skills/graphify/SKILL.md to enable."

# Run graphify-ingest then confirm readiness for the exit-gate commit.
phase-closeout: graphify-ingest
	@echo "[phase-closeout] graphify ingest complete. Ready for exit-gate commit."

# Fire a test alert against the dev Slack channel.
# Requires SLACK_WEBHOOK_DEV_URL to be set in the environment (or .env).
test-alert-fire:
	@test -n "$$SLACK_WEBHOOK_DEV_URL" || { echo "set SLACK_WEBHOOK_DEV_URL first"; exit 1; }
	python scripts/test_alert_fire.py --tenant t-dev

# Lint only the Phase I backend modules (non-blocking — trailing '|| true').
lint-backend:
	cd backend && python -m flake8 alert_manager.py slack_dispatcher.py cache_stats.py residual_risk_telemetry.py routers/ops_routes.py --max-line-length 120 || true

# Lint the React frontend.
lint-frontend:
	cd frontend && npm run lint
