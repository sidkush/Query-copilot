## Scope

Run / test / Docker commands for QueryCopilot V1 + the pytest test-suite
conventions. Ports + model defaults live in `config-defaults.md`.

## Setup & Running

```bash
# Backend (Python 3.10+, from backend/)
pip install -r requirements.txt
cp .env.example .env        # fill in ANTHROPIC_API_KEY, JWT_SECRET_KEY, etc.
uvicorn main:app --reload --port 8002

# ML training worker (separate process, only if using ML Engine async jobs)
celery -A celery_app worker --loglevel=info

# Frontend (from frontend/)
npm install
npm run dev                 # http://localhost:5173 (proxied to backend at localhost:8002)

# Lint frontend
npm run lint

# Build frontend for production
npm run build

# Preview production build locally
npm run preview
```

**Tests (pytest):**
```bash
cd backend
python -m pytest tests/ -v              # full suite (516+ tests)
python -m pytest tests/test_adv_*.py -v # adversarial hardening tests only
python -m pytest tests/test_bug_*.py -v # backlog bug fix tests only
python -m pytest tests/test_adv_otp_hash.py -v  # single test file
```

516+ auto tests across 84 files in `backend/tests/`. Security-focused + dashboard migration + chart customization — adversarial regression guards for OTP hashing, PII masking, SQL anonymization, file permissions, rate limiting, connection limits, more. Run full suite after any security change. Naming: `test_adv_*` = adversarial hardening, `test_bug_{round}_{number}_*` = backlog bug fixes (round 1–4, numbered).

**Manual test scripts** (not pytest — run one-by-one from `backend/`):
```bash
python test_registration.py       # auth flow smoke test
python test_waterfall.py          # waterfall routing tiers
python test_agent_engine.py       # agent tool-use loop
python test_phase1.py             # incremental feature tests (1-4)
python test_bi_editability.py     # BI editability features
python test_dual_response_invariants.py  # dual-response system invariants
python regression_test.py         # broad regression checks
```

**Docker:**
```bash
docker-compose up --build    # backend on :8000, frontend on :5173
```
Note: Docker map backend to 8000, not 8002. Local dev without Docker always use 8002 to match Vite proxy in `vite.config.js`. Both containers run as non-root `app` user. ChromaDB data persist via `chroma_data` named volume mapped to `/app/.chroma`. No CI/CD pipeline.


## See also
- `config-defaults.md` — ports, model IDs, MAX_ROWS.
- `arch-backend.md` — what's running behind the `uvicorn` command.
- `dev-notes.md` — plan workflow + reference document index.
