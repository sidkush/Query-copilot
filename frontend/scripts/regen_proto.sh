#!/usr/bin/env bash
# Regenerate TypeScript bindings from ../backend/proto/askdb/vizdataservice/v1.proto.
# Uses `python -m grpc_tools.protoc` (bundled protoc) instead of a system protoc
# binary so this works on Windows without choco install protoc.
#
# Invoked by `make proto-ts` or `npm run proto`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

OUT_FILE="src/components/dashboard/freeform/lib/vizSpecGenerated.ts"
PROTO_DIR="../backend/proto"
PROTO_FILE="../backend/proto/askdb/vizdataservice/v1.proto"

# ts-proto plugin - resolved via the local node_modules install.
PLUGIN_BIN="$HERE/node_modules/.bin/protoc-gen-ts_proto"
if [ ! -x "$PLUGIN_BIN" ] && [ ! -f "$PLUGIN_BIN.cmd" ]; then
  echo "ERROR: ts-proto plugin not found at $PLUGIN_BIN" >&2
  echo "Run: (cd frontend && npm install)" >&2
  exit 1
fi

# On Windows, node_modules/.bin/protoc-gen-ts_proto is a shim; protoc needs
# a path that is directly executable. Use the .cmd wrapper if available.
if [ -f "$PLUGIN_BIN.cmd" ]; then
  PLUGIN_BIN="$PLUGIN_BIN.cmd"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

python -m grpc_tools.protoc \
  --plugin="protoc-gen-ts_proto=$PLUGIN_BIN" \
  --ts_proto_out="$TMP_DIR" \
  --ts_proto_opt=esModuleInterop=true,forceLong=string,useOptionals=messages,outputEncodeMethods=false,outputJsonMethods=true,outputClientImpl=false,unrecognizedEnum=false \
  --proto_path="$PROTO_DIR" \
  "$PROTO_FILE"

GEN="$TMP_DIR/askdb/vizdataservice/v1.ts"
if [ ! -f "$GEN" ]; then
  echo "ERROR: expected generator output at $GEN" >&2
  ls -la "$TMP_DIR" >&2
  exit 1
fi

{
  echo "/**"
  echo " * GENERATED FILE - do not hand-edit."
  echo " * Regenerate via \`npm run proto\` (or \`bash scripts/regen_proto.sh\`)."
  echo " * Source: backend/proto/askdb/vizdataservice/v1.proto"
  echo " */"
  echo ""
  cat "$GEN"
} > "$OUT_FILE"

echo "frontend/scripts/regen_proto.sh: wrote $OUT_FILE"
