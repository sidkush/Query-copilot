## Scope

Hybrid tiered voice stack (whisper-local / deepgram / openai-realtime) + Progressive Dual-Response Data Acceleration. **On-demand** — read when touching voice or the dual-response pipeline.

### Voice Mode — Hybrid Tiered (`routers/voice_routes.py` + `voice_registry.py`)

Three-tier BYOK voice stack per Sub-project A Phase 3:
- **whisper-local** — whisper.cpp WASM in-browser via Web Worker. Free, private, ~2-3s latency. Model at `public/voice-models/whisper-tiny-en/`.
- **deepgram** — Deepgram streaming WebSocket. BYOK key (Fernet-encrypted in user profile). Backend mints ephemeral token via `POST /api/v1/voice/session`.
- **openai-realtime** — OpenAI Realtime API WebSocket. Same BYOK + ephemeral token pattern.

Frontend tier abstraction: `chart-ir/voice/voiceProvider.ts` (interface + registry), `whisperLocal.ts`, `deepgramStreaming.ts`, `openaiRealtime.ts` (real adapters, self-register at import). `stubs.ts` provides test-safe fallbacks.

Backend: `voice_registry.py` — `mint_ephemeral_token(email, tier)` with 5-min TTL. WebSocket at `/api/v1/voice/ws/{chat_id}` for text-flow continuous conversation (legacy path, still works). Voice and text share the same `SessionMemory` and `chat_id`.

### Dual-Response System (Progressive Dual-Response Data Acceleration)

When waterfall tier (memory/turbo) answers a query, system can simultaneously stream cached answer and fire live query to verify freshness. Controlled by 4 config flags:
- `DUAL_RESPONSE_ENABLED` (default True) — master toggle
- `DUAL_RESPONSE_STALENESS_TTL_SECONDS` (default 300) — cache age threshold; older = stale
- `DUAL_RESPONSE_ALWAYS_CORRECT` (default True) — always fire live correction even when cache fresh
- `WRITE_TIME_MASKING` (default False) — PII mask at DuckDB write time instead of read time
- `BEHAVIOR_WARMING_ENABLED` (default False) — pre-warm cache from predicted query patterns

## See also
- `config-defaults.md` — `DUAL_RESPONSE_*` flags, behaviour warming.
- `arch-backend.md` — `voice_routes.py` + `voice_registry.py` mint BYOK ephemeral tokens.
- `security-core.md` — PII masking still runs even on the cached fast path.
