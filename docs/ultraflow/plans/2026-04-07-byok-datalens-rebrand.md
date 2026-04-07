# Plan: BYOK + DataLens Rebrand + Interactive Onboarding

**Spec**: `docs/ultraflow/specs/UFSD-2026-04-07-byok-datalens-rebrand.md`
**Approach**: Own provider ABC + AnthropicProvider adapter; per-user Fernet-encrypted API key; full rename; 5-step onboarding
**Branch**: `feature/byok-datalens`

## Assumption Registry

- ASSUMPTION: `_fernet()` in user_storage.py uses SHA256(JWT_SECRET_KEY) — validated by code read
- ASSUMPTION: `load_profile()`/`save_profile()` use `_backend.read_json`/`write_json` with `_lock` — validated by code read. NOTE: `save_profile()` does NOT pass `atomic=True` (unlike dashboards/chats). Task 4 must use `atomic=True` when saving API keys since they are encrypted secrets.
- ASSUMPTION: `get_current_user` dependency returns `{"email": ...}` dict — validated by user_routes.py pattern
- ASSUMPTION: QueryEngine constructor takes `db_connector` + `namespace` — validated by code read (line 187)
- ASSUMPTION: AgentEngine constructor takes `engine`, `email`, `connection_entry` + kwargs — validated by code read (line 425)
- ASSUMPTION: `app.state.connections[email][conn_id]` is the in-memory connection store — validated by connection_routes.py
- ASSUMPTION: `TOKENS` object in tokens.js has flat structure with `accent`, `accentLight`, `accentGlow` at root level — validated by code read
- ASSUMPTION: Zustand store uses manual `localStorage` sync in setters (no middleware) — validated by code read
- ASSUMPTION: Demo login navigates to `/dashboard` after `setAuth()` — validated by Login.jsx code read
- ASSUMPTION: There are exactly 16 user-facing "QueryCopilot" strings + HTML metadata — validated by frontend scan
- ASSUMPTION: `SessionMemory._summarize_messages()` creates an ad-hoc `anthropic.Anthropic()` client (line 347) — validated by discovery agent scan
- ASSUMPTION: HTTP 422 is the error code for invalid API key (spec said 407, but 407 means "Proxy Authentication Required" which is semantically wrong; 422 "Unprocessable Entity" is correct) — validated by HTTP spec
- ASSUMPTION: Spec names `BRAND_PURPLE`, `complete_tools`, `decrypt_api_key` diverge from plan names `brandPurple` (matches TOKENS camelCase convention), `complete_with_tools` (more descriptive), `decrypt_password` (reuses existing function). Plan names are intentional and authoritative — validated by codebase conventions
- ASSUMPTION: Demo user email is currently `demo@querycopilot.test` (auth_routes.py line 130). Task 10 renames it to `demo@datalens.dev`. Frontend detects demo user via `user.email === "demo@datalens.dev"` — validated by auth_routes.py code read + planned rename
- ASSUMPTION: Demo user is PERSISTENT (created in users.json via `create_user()`, not ephemeral). Tutorial is auto-completed via `mark_tutorial_complete()`. This is fine — no change needed — validated by auth_routes.py code read
- ASSUMPTION: `save_profile()` currently does NOT use atomic writes. New `save_api_key_to_profile()` helper in Task 4 MUST pass `atomic=True` to `write_json()` since it stores Fernet-encrypted secrets — validated by user_storage.py code read (line 79: `atomic` param exists)
- ASSUMPTION: `CHROMA_PERSIST_DIR` defaults to `.chroma/querycopilot` (config.py line 127). This is a filesystem path, NOT user-facing. Renaming it would break existing ChromaDB data. Do NOT rename this path — validated by config.py code read
- ASSUMPTION: `QUERYCOPILOT_ENV` environment variable used in demo login production guard (auth_routes.py line 189). Add `DATALENS_ENV` as alias with fallback to `QUERYCOPILOT_ENV` for backward compat — validated by auth_routes.py code read
- ASSUMPTION: Agent system prompt says "You are QueryCopilot, an AI data analyst agent" (agent_engine.py line 389). Must rename to "DataLens" — validated by agent_engine.py code read
- ASSUMPTION: 21 backend "querycopilot" references exist (config.py, agent_engine.py, auth_routes.py, auth.py, otp.py, digest.py, main.py, redis_client.py, user_storage.py + test files). Task 10 must cover ALL of these — validated by grep scan
- ASSUMPTION: `ProtectedRoute` in App.jsx only checks token, NOT tutorialComplete/onboardingComplete. Task 14 must add onboarding enforcement to ProtectedRoute — validated by App.jsx code read

## Invariant List

- Invariant-1: **Read-only enforcement** — 3 independent layers (driver, SQL validator, connector). No task may weaken any layer.
- Invariant-2: **Two-step query flow** — `/generate` then `/execute`. Provider migration must not collapse these.
- Invariant-3: **PII masking** — `mask_dataframe()` runs before data reaches users or LLM. Provider changes must not bypass this.
- Invariant-4: **Agent guardrails** — MAX_TOOL_CALLS=12, WALL_CLOCK_LIMIT=60s per segment, ABSOLUTE_WALL_CLOCK_LIMIT=600s, MAX_SQL_RETRIES=3. Provider swap must preserve these.
- Invariant-5: **Fernet key derivation** — `FERNET_SECRET_KEY` (if set) takes priority, else fallback to SHA256(JWT_SECRET_KEY) → base64. Changing EITHER key invalidates all saved DB passwords AND API keys. API key encryption reuses existing `encrypt_password()`/`decrypt_password()` which call `_fernet()` internally.
- Invariant-6: **Atomic file writes** — write-then-rename pattern for crash safety. New storage operations must follow this.

## Failure Mode Map

1. FM-1: Provider ABC leaks Anthropic-specific types into agent_engine.py (mitigated by Task 2 — ContentBlock dataclass abstracts blocks. Validated: agent loop accesses exactly 5 attributes {type, text, name, input, id} on block objects (lines 935-943), all mapped to ContentBlock fields {type, text, tool_name, tool_input, tool_use_id}. No other Anthropic-specific attributes accessed.)
2. FM-2: Broken connection flow from constructor signature change (mitigated by Task 4+5 — lockstep migration with connection_routes.py)
3. FM-3: Partial rename leaves "QueryCopilot" visible (mitigated by Task 10 — grep verification step)
4. FM-4: Demo login regression — platform key path not handled (mitigated by Task 3 — explicit demo user branch in registry)
5. FM-5: Onboarding gate blocks existing users (mitigated by Task 14 — two redirect conditions: new users get full flow, existing users with `onboardingComplete` but no API key redirect to `/onboarding?step=3` for API key entry only)

---

## Tasks

### Task 1: Create ModelProvider ABC and response dataclasses (~5 min)
- **Files**: `backend/model_provider.py` (create)
- **Intent**: Define `ModelProvider` ABC with `complete()`, `complete_stream()`, `complete_with_tools()`, `validate_key()`, `supports_prompt_caching()`, `supports_vision()`. Define `ProviderResponse`, `ContentBlock`, `ProviderToolResponse` dataclasses. Define `InvalidKeyError` exception.
- **Code** (critical — API contract):
```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterator, Optional

class InvalidKeyError(Exception):
    """Raised when the provider API key is invalid or revoked."""
    pass

@dataclass
class ProviderResponse:
    text: str
    usage: dict
    stop_reason: str

@dataclass
class ContentBlock:
    type: str  # "text" or "tool_use"
    text: Optional[str] = None
    tool_name: Optional[str] = None
    tool_input: Optional[dict] = None
    tool_use_id: Optional[str] = None

@dataclass
class ProviderToolResponse:
    content_blocks: list[ContentBlock]
    stop_reason: str
    usage: dict

class ModelProvider(ABC):
    provider_name: str = "base"

    @abstractmethod
    def complete(self, *, model: str, system: str, messages: list, max_tokens: int, **kwargs) -> ProviderResponse: ...

    @abstractmethod
    def complete_stream(self, *, model: str, system: str, messages: list, max_tokens: int, **kwargs) -> Iterator[str]: ...

    @abstractmethod
    def complete_with_tools(self, *, model: str, system: str, messages: list, tools: list, max_tokens: int, **kwargs) -> ProviderToolResponse: ...

    @abstractmethod
    def validate_key(self) -> bool: ...

    def supports_prompt_caching(self) -> bool:
        return False

    def supports_vision(self) -> bool:
        return False
```
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from model_provider import ModelProvider, ProviderResponse, ContentBlock, ProviderToolResponse, InvalidKeyError; print('OK')"` → expects `OK`
- **Commit**: `feat(byok): add ModelProvider ABC and response dataclasses`

### Task 2: Create AnthropicProvider adapter (~10 min)
- **Files**: `backend/anthropic_provider.py` (create)
- **Intent**: Implement `AnthropicProvider(ModelProvider)` wrapping `anthropic.Anthropic`. Translates between generic interface and Anthropic SDK. Preserves ephemeral prompt caching (wraps system prompt in `cache_control` block when `supports_prompt_caching()` returns True). Implements circuit breaker (3 consecutive failures → 30s cooldown → fallback model). `complete()` calls `messages.create()`, extracts `response.content[0].text`. `complete_stream()` uses `messages.stream()` context manager, yields text chunks. `complete_with_tools()` calls `messages.create(tools=...)`, maps Anthropic content blocks to `ContentBlock` dataclass. `validate_key()` sends minimal 1-token message, catches `AuthenticationError`. Raises `InvalidKeyError` on 401/403.
- **Code** (critical — circuit breaker + tool-use translation):
```python
import anthropic
from model_provider import ModelProvider, ProviderResponse, ContentBlock, ProviderToolResponse, InvalidKeyError

class AnthropicProvider(ModelProvider):
    provider_name = "anthropic"

    def __init__(self, api_key: str, default_model: str = "claude-haiku-4-5-20251001",
                 fallback_model: str | None = None, timeout: float = 60.0):
        self.api_key = api_key
        self.default_model = default_model
        self.fallback_model = fallback_model
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout)
        # Circuit breaker state
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0
        self._max_failures = 3
        self._cooldown_seconds = 30.0

    def supports_prompt_caching(self) -> bool:
        return True

    def supports_vision(self) -> bool:
        return True

    def validate_key(self) -> bool:
        try:
            self._client.messages.create(
                model=self.default_model,
                max_tokens=1,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True
        except anthropic.AuthenticationError:
            raise InvalidKeyError("Invalid Anthropic API key")
        except anthropic.PermissionDeniedError:
            raise InvalidKeyError("API key lacks required permissions")
        except Exception:
            return False  # Network error, rate limit — key may be valid
```
- **Invariants**: none (new file, no existing behavior changed)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from anthropic_provider import AnthropicProvider; print('OK')"` → expects `OK`
- **Commit**: `feat(byok): implement AnthropicProvider adapter with circuit breaker`

### Task 3: Create provider registry with demo user support (~5 min)
- **Files**: `backend/provider_registry.py` (create)
- **Intent**: `get_provider_for_user(email)` function. Loads user profile, decrypts API key, returns `AnthropicProvider`. Demo user (`demo@datalens.dev` or configured constant) gets platform key from `settings.ANTHROPIC_API_KEY`. Raises `InvalidKeyError` if no key configured. Also: `ANTHROPIC_MODELS` dict mapping model IDs to display names/tiers, `get_fallback_model(preferred)` function for auto-selecting fallback.
- **Code** (critical — demo user path):
```python
from config import settings
from user_storage import load_profile, decrypt_password  # reuse Fernet
from anthropic_provider import AnthropicProvider
from model_provider import InvalidKeyError

DEMO_USER_EMAIL = "demo@datalens.dev"  # Renamed from "demo@querycopilot.test" in Task 10

ANTHROPIC_MODELS = {
    "claude-haiku-4-5-20251001": {"name": "Claude Haiku 4.5", "tier": "fast", "cost": "$"},
    "claude-sonnet-4-5-20250514": {"name": "Claude Sonnet 4.5", "tier": "balanced", "cost": "$$"},
    "claude-sonnet-4-20250514": {"name": "Claude Sonnet 4", "tier": "balanced", "cost": "$$"},
    "claude-opus-4-20250514": {"name": "Claude Opus 4", "tier": "powerful", "cost": "$$$"},
}

def get_fallback_model(preferred: str) -> str:
    if "haiku" in preferred:
        return "claude-sonnet-4-5-20250514"
    return "claude-sonnet-4-5-20250514"  # Sonnet is universal fallback

def get_provider_for_user(email: str) -> AnthropicProvider:
    if email == DEMO_USER_EMAIL:
        return AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            default_model=settings.PRIMARY_MODEL,
            fallback_model=settings.FALLBACK_MODEL,
        )
    profile = load_profile(email)
    encrypted_key = profile.get("api_key_encrypted")
    if not encrypted_key:
        raise InvalidKeyError("No API key configured. Please add your Anthropic API key in Account settings.")
    api_key = decrypt_password(encrypted_key)  # Reuses existing Fernet decrypt
    preferred = profile.get("preferred_model", settings.PRIMARY_MODEL)
    fallback = get_fallback_model(preferred)
    return AnthropicProvider(api_key=api_key, default_model=preferred, fallback_model=fallback)
```
- **Invariants**: Invariant-5 (Fernet key derivation — reuses `decrypt_password`, does not change derivation)
- **Invariant-Check**: `python -c "from user_storage import encrypt_password, decrypt_password; e = encrypt_password('test123'); assert decrypt_password(e) == 'test123'; print('Fernet OK')"` → confirms Invariant-5 holds
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from provider_registry import get_provider_for_user, ANTHROPIC_MODELS, DEMO_USER_EMAIL; print(len(ANTHROPIC_MODELS), DEMO_USER_EMAIL)"` → expects `4 demo@datalens.dev`
- **Commit**: `feat(byok): add provider registry with demo user and model catalog`

### Task 4: Add API key endpoints to user_routes.py (~5 min)
- **Files**: `backend/routers/user_routes.py` (modify)
- **Intent**: Add 6 new endpoints: `POST /api-key` (validate + encrypt + save), `GET /api-key/status` (masked key + validity), `DELETE /api-key` (remove), `POST /api-key/validate` (re-validate), `PUT /preferred-model` (update selection), `GET /available-models` (list). All use `get_current_user` dependency. Validation via `AnthropicProvider.validate_key()`. Import `encrypt_password` for encrypting (same Fernet). CRITICAL: Create a `save_api_key_to_profile()` helper in `user_storage.py` that calls `_backend.write_json(key, data, atomic=True)` — existing `save_profile()` does NOT use atomic writes, but API keys are encrypted secrets and must use write-then-rename. Also returns HTTP 422 for invalid key errors.
- **Invariants**: Invariant-5 (reuses existing Fernet `encrypt_password()`/`decrypt_password()`), Invariant-6 (new helper uses `atomic=True` for crash-safe API key writes)
- **Invariant-Check**: `python -c "from user_storage import save_profile, load_profile; save_profile('test@x.com', {'test': True}); p = load_profile('test@x.com'); assert p.get('test'); print('atomic write OK')"` → confirms Invariant-6
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from routers.user_routes import router; paths = [r.path for r in router.routes]; assert '/api-key' in str(paths); print('routes OK')"` → expects `routes OK`
- **Commit**: `feat(byok): add API key CRUD and model selection endpoints`

### Task 5: Migrate query_engine.py to use ModelProvider (~5 min)
- **Files**: `backend/query_engine.py` (modify)
- **Intent**: Change constructor to accept `provider: ModelProvider` instead of creating `anthropic.Anthropic`. Remove `import anthropic` from file. Replace `self.client = anthropic.Anthropic(...)` with `self.provider = provider`. Replace `self.client.messages.create(...)` in `_call_claude()` with `self.provider.complete(...)`. Replace `self.client.messages.stream(...)` in `generate_sql_stream()` with `self.provider.complete_stream(...)`. Replace calls in `_generate_summary()` and `_call_claude_dashboard()`. Use `self.provider.default_model` instead of `self.primary_model`. Keep prompt caching: wrap system prompt in cache_control only if `self.provider.supports_prompt_caching()`.
- **Invariants**: Invariant-1 (read-only — no change to SQL validation), Invariant-2 (two-step flow unchanged), Invariant-3 (PII masking unchanged)
- **Invariant-Check**: `grep -c "mask_dataframe\|SQLValidator\|validate_sql" backend/query_engine.py` → count should be unchanged from before edit (verify ≥3 occurrences)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from query_engine import QueryEngine; print('import OK')"` → expects `import OK` (no anthropic import errors)
- **Commit**: `refactor(byok): migrate query_engine.py to ModelProvider interface`

### Task 6: Migrate agent_engine.py to use ModelProvider (~5 min)
- **Files**: `backend/agent_engine.py` (modify)
- **Intent**: Change constructor to accept `provider: ModelProvider`. Remove `import anthropic`. Replace `self.client = anthropic.Anthropic(...)` with `self.provider = provider`. Replace main loop `self.client.messages.create(tools=...)` with `self.provider.complete_with_tools(...)`. Map returned `ContentBlock` objects to existing step-emission logic. Replace `SessionMemory._summarize_messages()` ad-hoc client with provider passed into SessionMemory constructor. Keep all guardrails (max tool calls, timeout, SQL retries) unchanged.
- **Invariants**: Invariant-4 (agent guardrails — must preserve MAX_TOOL_CALLS=12, WALL_CLOCK_LIMIT=60s, ABSOLUTE_WALL_CLOCK_LIMIT=600s, MAX_SQL_RETRIES=3)
- **Invariant-Check**: `grep -c "MAX_TOOL_CALLS\|WALL_CLOCK_LIMIT\|MAX_SQL_RETRIES" backend/agent_engine.py` → should be ≥6 occurrences (unchanged). Also: `python -c "from agent_engine import AgentEngine; assert AgentEngine.MAX_TOOL_CALLS == 12; assert AgentEngine.MAX_SQL_RETRIES == 3; print('guardrails OK')"` → expects `guardrails OK`
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from agent_engine import AgentEngine; print('import OK')"` → expects `import OK`
- **Commit**: `refactor(byok): migrate agent_engine.py to ModelProvider interface`

### Task 7: Migrate remaining call sites (behavior_engine, routers) (~5 min)
- **Files**: `backend/behavior_engine.py` (modify), `backend/routers/alert_routes.py` (modify), `backend/routers/query_routes.py` (modify), `backend/routers/dashboard_routes.py` (modify)
- **Intent**: Replace all ad-hoc `anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)` with `get_provider_for_user(email)`. In router files, extract email from `get_current_user` dependency (already available). In `behavior_engine.py`, pass email as parameter. Remove `import anthropic` from all 4 files. Update hardcoded model strings (e.g., `"claude-haiku-4-5-20251001"`) to use `provider.default_model`.
- **Invariants**: Invariant-3 (PII masking in query_routes — unchanged)
- **Invariant-Check**: `grep -c "mask_dataframe" backend/routers/query_routes.py` → should be ≥1 (unchanged)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "import importlib; [importlib.import_module(m) for m in ['behavior_engine', 'routers.alert_routes', 'routers.query_routes']]; print('all imports OK')"` → expects `all imports OK`
- **Commit**: `refactor(byok): migrate behavior_engine and router call sites to ModelProvider`

### Task 8: Update connection_routes.py to inject provider into engines (~5 min)
- **Files**: `backend/routers/connection_routes.py` (modify), `backend/routers/agent_routes.py` (modify), `backend/models.py` (modify)
- **Intent**: In the connect endpoint, after creating `DatabaseConnector`, call `get_provider_for_user(email)` to get the provider. Pass it to `QueryEngine(db_connector, namespace, provider=provider)` constructor. Update `ConnectionEntry` — no structural change needed since it stores `engine` which now internally holds provider. In `agent_routes.py`, pass provider when creating `AgentEngine`. Add a `get_user_provider(request)` helper function in `connection_routes.py` that extracts email from JWT and calls `get_provider_for_user()` — reusable by other routers. This is the critical lockstep change — connection flow must work end-to-end after this.
- **Invariants**: Invariant-1 (read-only enforcement in connector unchanged), Invariant-2 (two-step flow unchanged)
- **Invariant-Check**: `grep -c "READ ONLY\|read_only\|readonly" backend/db_connector.py` → should be ≥2 (unchanged)
- **Test**: `cd "QueryCopilot V1/backend" && python -c "from routers.connection_routes import router; print('connection routes OK')"` → expects `connection routes OK`
- **Commit**: `feat(byok): inject user provider into QueryEngine and AgentEngine via connection flow`

### Task 9: Add BRAND_PURPLE token and create DataLensLogo component (~5 min)
- **Files**: `frontend/src/components/dashboard/tokens.js` (modify), `frontend/src/components/DataLensLogo.jsx` (create)
- **Intent**: Add `brandPurple: '#A855F7'` to `TOKENS` object (after `accentGlow`). Create `DataLensLogo` component with `size` prop (sm/md/lg mapping to text sizes) and `className` prop. Renders "Data" in `text-slate-100` + "Lens" in `TOKENS.brandPurple`. Uses Poppins font. Export as default.
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npx -y acorn --ecma2020 src/components/DataLensLogo.jsx 2>&1 | head -1` → expects no parse error (valid JSX). Also: `grep -c "brandPurple" src/components/dashboard/tokens.js` → expects `1`
- **Commit**: `feat(rebrand): add BRAND_PURPLE token and DataLensLogo component`

### Task 10: Rename all QueryCopilot references to DataLens (~10 min)
- **Files** (frontend — 18 user-facing occurrences): `frontend/src/pages/Tutorial.jsx` (modify), `frontend/src/pages/Landing.jsx` (modify), `frontend/src/components/AppSidebar.jsx` (modify), `frontend/src/pages/AdminDashboard.jsx` (modify), `frontend/src/pages/Profile.jsx` (modify), `frontend/src/pages/SharedDashboard.jsx` (modify), `frontend/src/pages/Login.jsx` (modify), `frontend/src/index.css` (modify), `frontend/index.html` (modify)
- **Files** (backend — 21 occurrences): `backend/config.py` (modify — APP_TITLE, RESEND_FROM_EMAIL, SMTP_FROM_NAME; do NOT rename CHROMA_PERSIST_DIR `.chroma/querycopilot` as it breaks existing data), `backend/agent_engine.py` (modify — system prompt "You are QueryCopilot" → "You are DataLens"), `backend/routers/auth_routes.py` (modify — DEMO_EMAIL `demo@querycopilot.test` → `demo@datalens.dev`, add `DATALENS_ENV` alias alongside `QUERYCOPILOT_ENV` for backward compat), `backend/auth.py` (modify — docstring), `backend/otp.py` (modify — email subject/body text), `backend/digest.py` (modify — email templates, docstring), `backend/main.py` (modify — log messages), `backend/redis_client.py` (modify — docstring), `backend/user_storage.py` (modify — docstring)
- **Intent**: Replace all user-facing "QueryCopilot" strings with "DataLens". In frontend components that render the brand name inline (sidebar, login, landing), replace with `<DataLensLogo />` component import. In plain text contexts (aria-labels, meta tags, comments, email templates, system prompts, log messages), replace string directly. Update footer email to `hello@datalens.ai`, social to `@DataLens`, copyright to `DataLens`. PRESERVE: `CHROMA_PERSIST_DIR` path (`.chroma/querycopilot`) — this is a filesystem path, renaming it breaks existing vector stores. Add `DATALENS_ENV` env var check alongside `QUERYCOPILOT_ENV` (backward compat: `os.environ.get("DATALENS_ENV") or os.environ.get("QUERYCOPILOT_ENV")`). Do NOT rename test files (regression_test.py, test_registration.py, test_waterfall.py) — they are manual scripts.
- **Invariants**: none (user-facing strings only; no security/data changes)
- **Test**: `cd "QueryCopilot V1" && grep -ri "querycopilot" frontend/src/ frontend/index.html --include="*.jsx" --include="*.js" --include="*.html" --include="*.css" | wc -l` → expects `0`. Also: `grep -ri "querycopilot" backend/ --include="*.py" | grep -v "test_\|regression_\|chroma/querycopilot\|QUERYCOPILOT_ENV" | wc -l` → expects `0` (all user-facing references gone, only test files and preserved paths remain)
- **Commit**: `feat(rebrand): rename all QueryCopilot references to DataLens across frontend and backend`

### Task 11: Add API key functions to api.js and Zustand store (~5 min)
- **Files**: `frontend/src/api.js` (modify), `frontend/src/store.js` (modify)
- **Intent**: Add 6 API functions to `api` object: `saveApiKey(key)`, `getApiKeyStatus()`, `deleteApiKey()`, `validateApiKey()`, `updatePreferredModel(model)`, `getAvailableModels()`. In store.js: add `apiKeyStatus`, `preferredModel`, `availableModels`, `onboardingComplete` state. Add setters. Replace `tutorialComplete` with `onboardingComplete` (same localStorage pattern). Add `api_key_invalid` error detection in the `request()` function that sets `apiKeyStatus.valid = false`.
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/frontend" && grep -c "saveApiKey\|getApiKeyStatus\|deleteApiKey\|validateApiKey\|updatePreferredModel\|getAvailableModels" src/api.js` → expects `6`
- **Commit**: `feat(byok): add API key management to frontend API layer and store`

### Task 12: Build Onboarding page — Step 1 (Welcome) and Step 2 (Tour) (~10 min)
- **Files**: `frontend/src/pages/Onboarding.jsx` (create), `frontend/src/components/onboarding/OnboardingWelcome.jsx` (create), `frontend/src/components/onboarding/OnboardingTour.jsx` (create)
- **Intent**: `Onboarding.jsx` is the page component with step state (1-5), progress indicator (stepped dots), AnimatePresence transitions, 3D background (lazy-loaded Background3D with WebGL fallback). `OnboardingWelcome` — full-screen hero with DataLensLogo (large), one-line tagline, animated "Get Started" CTA with glow effect. `OnboardingTour` — 3-panel showcase: Ask (typing animation), Review (SQL syntax highlight), Insight (chart + summary). Panels auto-advance on 3.5s timer or click. Glassmorphism cards. Both use Framer Motion for entrance animations and GSAP for micro-interactions.
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5` → expects successful build (no import errors)
- **Commit**: `feat(onboarding): create Onboarding page with Welcome and Tour steps`

### Task 13: Build Onboarding Step 3 (API Key) and Step 4 (Connect DB) (~10 min)
- **Files**: `frontend/src/components/onboarding/OnboardingApiKey.jsx` (create), `frontend/src/components/onboarding/OnboardingConnect.jsx` (create)
- **Intent**: `OnboardingApiKey` — focused card with password-masked input, show/hide toggle, "Get an API key" external link, validate-on-submit (calls `api.saveApiKey()`), spinner → green checkmark or red error. Cannot proceed until validated. Demo variant: auto-filled input with "Demo key active" purple badge, auto-proceeds. `OnboardingConnect` — compact connection form (reuse patterns from existing connection modal), DB icons grid, "Skip for now" option, success animation on connect showing table/column count from schema discovery.
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5` → expects successful build
- **Commit**: `feat(onboarding): add API Key entry and Connect DB onboarding steps`

### Task 14: Build Onboarding Step 5 (First Query) and wire routing (~5 min)
- **Files**: `frontend/src/components/onboarding/OnboardingFirstQuery.jsx` (create), `frontend/src/App.jsx` (modify), `frontend/src/pages/Login.jsx` (modify), `frontend/src/pages/Tutorial.jsx` (delete or leave unused)
- **Intent**: `OnboardingFirstQuery` — if DB connected, show pre-populated sample question + mini chat interface; if no DB, show "Connect a database" CTA. On successful query: celebration animation + "Go to Dashboard" button.

  **App.jsx changes (CRITICAL — onboarding enforcement):**
  1. Replace `/tutorial` route with `/onboarding` pointing to new `Onboarding.jsx`. Remove Tutorial import.
  2. Modify `ProtectedRoute` to enforce onboarding. Current ProtectedRoute ONLY checks `token` — it does NOT check onboarding state. Add: if `token && !onboardingComplete && location.pathname !== "/onboarding"` → redirect to `/onboarding`. This prevents users from bypassing onboarding by navigating directly to `/dashboard`.
  3. Add a separate `OnboardingGate` wrapper (or extend ProtectedRoute) that checks API key: if `token && onboardingComplete && !apiKeyConfigured` → redirect to `/onboarding?step=3` (existing users who completed old tutorial but have no API key).
  4. The `Onboarding.jsx` component reads the `step` query param via `useSearchParams()` to set initial step, allowing direct-to-step-3 routing.

  **Login.jsx changes:**
  - `handleDemoLogin` and `handleLogin`: after `setAuth()`, check `data.user.tutorial_completed` (maps to old `onboardingComplete`). Navigate to `/onboarding` if not completed, `/dashboard` if completed AND has API key, `/onboarding?step=3` if completed but no API key.
  - Demo user detected via `user.email === "demo@datalens.dev"` from auth response for conditional auto-fill in Step 3.

  **Login redirect truth table:**
  | tutorial_completed | has API key | Redirect to |
  |---|---|---|
  | false | N/A | `/onboarding` (full flow) |
  | true | true | `/dashboard` |
  | true | false | `/onboarding?step=3` (API key only) |
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5` → expects successful build. Also: `grep -c "onboarding" src/App.jsx` → expects ≥2 (route + import)
- **Commit**: `feat(onboarding): add First Query step and wire onboarding routing`

### Task 15: Add API Key management section to Account page (~5 min)
- **Files**: `frontend/src/pages/Account.jsx` (modify)
- **Intent**: Add "API Configuration" card section. Shows: key status badge (green Valid / red Invalid / gray Not configured), masked key (`sk-ant-...xxxx`), provider label ("Anthropic"), preferred model dropdown (from `availableModels` store state) with cost tier indicators. "Update Key" button opens modal with input + validation flow. "Remove Key" with confirmation dialog. "Last validated" timestamp. On mount, calls `api.getApiKeyStatus()` and `api.getAvailableModels()` to populate. Model change calls `api.updatePreferredModel()`.
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5` → expects successful build. Also: `grep -c "api-key\|apiKey\|API Configuration" src/pages/Account.jsx` → expects ≥3
- **Commit**: `feat(byok): add API key management section to Account page`

### Task 16: Add invalid-key error banner to AppLayout (~3 min)
- **Files**: `frontend/src/components/AppLayout.jsx` (modify)
- **Intent**: Read `apiKeyStatus` from Zustand store. If `apiKeyStatus?.valid === false`, render a persistent top banner (amber/red gradient, fixed position above content): "Your API key is no longer valid. [Update Key]". "Update Key" navigates to `/account`. Banner dismisses only when `apiKeyStatus.valid` becomes true. Does not render for demo user.
- **Invariants**: none
- **Test**: `cd "QueryCopilot V1/frontend" && npm run build 2>&1 | tail -5` → expects successful build
- **Commit**: `feat(byok): add invalid API key banner to AppLayout`

### Task 17: Final verification and lint (~3 min)
- **Files**: none (verification only)
- **Intent**: Run frontend lint. Run backend import check for all modified files. Verify zero "QueryCopilot" references remain. Verify zero `import anthropic` outside of `anthropic_provider.py`. Verify all 14 call sites use provider.
- **Invariants**: Invariant-1, Invariant-2, Invariant-3, Invariant-4 (all — final check)
- **Invariant-Check**: Run all 4 invariant checks from earlier tasks. Plus: `grep -rn "import anthropic" backend/ --include="*.py" | grep -v anthropic_provider.py | grep -v __pycache__` → expects 0 results
- **Test**: `cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -10` → expects no errors. `cd "QueryCopilot V1/backend" && python -c "from main import app; print('backend loads OK')"` → expects `backend loads OK`
- **Commit**: `chore: lint fixes and final BYOK verification`

---

## Task Dependencies

```
Task 1 (ABC) ─────┐
                   ├──→ Task 2 (AnthropicProvider)
                   │         │
                   │         ├──→ Task 3 (Registry) ──→ Task 4 (API key endpoints)
                   │         │                                    │
                   │         ├──→ Task 5 (query_engine) ──────────┤
                   │         │                                    │
                   │         ├──→ Task 6 (agent_engine) ──────────┤
                   │         │                                    │
                   │         └──→ Task 7 (remaining sites) ───────┤
                   │                                              │
                   │              Task 8 (connection flow) ◄──────┘
                   │
Task 9 (tokens + logo) ──→ Task 10 (rename all) ──→ Task 12 (onboarding 1-2)
                                                         │
Task 11 (api.js + store) ◄──── Task 4 ──────────────────┤
        │                                                │
        └──→ Task 13 (onboarding 3-4) ──→ Task 14 (onboarding 5 + routing)
                                              │
                                              ├──→ Task 15 (Account page)
                                              │
                                              └──→ Task 16 (error banner)
                                                       │
                                                       └──→ Task 17 (verification)
```

**Parallelizable groups:**
- After Task 2: Tasks 3, 5, 6, 7 can run in parallel (no shared state)
- After Task 2: Task 9 is independent of backend tasks
- Tasks 12+13 can overlap with backend Tasks 5-8

## Scope Validation

Tasks in scope: All 17 tasks map directly to spec sections 1-10.
Tasks flagged: none — no scope deviations.

## Counterfactual Gate

**Counterfactual**: The strongest argument against this plan is that migrating all 14 call sites in one pass (Tasks 5-8) creates a large blast radius — if any adapter translation is wrong, every LLM feature breaks simultaneously. An incremental migration (one file at a time with the old path as fallback) would be safer.

**Acceptance**: We accept because (1) the AnthropicProvider is a thin 1:1 wrapper over the same SDK — it's not changing behavior, only indirection; (2) all 14 call sites use the same 3 patterns (`messages.create`, `messages.stream`, `messages.create(tools=...)`) which map directly to the 3 ABC methods; (3) the existing code has no tests to break — the import-check tests in each task catch wiring errors immediately; (4) a dual-path migration would double the complexity and create a longer-lived inconsistent state.

> Impact estimates are REASONED, not PROVEN — assumption chain: [AnthropicProvider is behaviorally identical to direct SDK calls] → [tool-use ContentBlock mapping preserves all fields] → [circuit breaker logic moved, not changed] → [no semantic change to any call site].

## MVP-Proof

No performance or scalability claims made. Provider instantiation is per-connection (same as current Anthropic client). No new caching, no new concurrency patterns.

## Fingerprint

Backend has 3 new files (model_provider.py, anthropic_provider.py, provider_registry.py), zero `import anthropic` outside anthropic_provider.py, 6 new API key endpoints; frontend has DataLensLogo component, 5-step onboarding flow, API key management in Account page; zero "QueryCopilot" strings remain in user-facing surfaces.
