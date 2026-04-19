.PHONY: proto proto-py proto-ts clean-proto

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
