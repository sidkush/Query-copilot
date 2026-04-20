#!/usr/bin/env bash
# Regenerate Python bindings from backend/proto/askdb/vizdataservice/v1.proto.
# Invoked by `make proto-py` or directly via bash.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

OUT_DIR="vizql/proto"
PROTO_DIR="proto"
PROTO_FILE="proto/askdb/vizdataservice/v1.proto"

mkdir -p "$OUT_DIR"

python -m grpc_tools.protoc \
  --proto_path="$PROTO_DIR" \
  --python_out="$OUT_DIR" \
  --pyi_out="$OUT_DIR" \
  "$PROTO_FILE"

# Generator writes to $OUT_DIR/askdb/vizdataservice/v1_pb2.py because it
# mirrors the proto package path. Flatten to $OUT_DIR/v1_pb2.py so
# imports stay `from vizql.proto import v1_pb2`.
GEN="$OUT_DIR/askdb/vizdataservice/v1_pb2.py"
GEN_PYI="$OUT_DIR/askdb/vizdataservice/v1_pb2.pyi"

if [ -f "$GEN" ]; then
  mv "$GEN" "$OUT_DIR/v1_pb2.py"
fi
if [ -f "$GEN_PYI" ]; then
  mv "$GEN_PYI" "$OUT_DIR/v1_pb2.pyi"
fi

rm -rf "$OUT_DIR/askdb"

# Post-process generated .pyi: grpc_tools/protoc emits bare `_Mapping`
# (no type parameters) which trips `mypy --strict` with `type-arg`.
# Parametrise to `_Mapping[_Any, _Any]` and inject `Any as _Any` into
# the typing import. Drop once upstream stub generator parametrises.
python - "$OUT_DIR/v1_pb2.pyi" <<'PY'
import re, sys
path = sys.argv[1]
src = open(path, encoding="utf-8").read()
if "Any as _Any" not in src:
    src = src.replace(
        "from typing import ClassVar as _ClassVar,",
        "from typing import Any as _Any, ClassVar as _ClassVar,",
        1,
    )
src = re.sub(
    r"(?<!Mapping as )_Mapping(?!\[)",
    "_Mapping[_Any, _Any]",
    src,
)
open(path, "w", encoding="utf-8").write(src)
PY

echo "backend/scripts/regen_proto.sh: wrote $OUT_DIR/v1_pb2.py + v1_pb2.pyi"
