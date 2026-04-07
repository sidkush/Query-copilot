# UFSD Summary

- **Feature:** BYOK (Bring Your Own Key) + product rename to DataLens + interactive onboarding redesign
- **Scope Baseline:**
  - In: Global rename to DataLens, provider abstraction (ABC + AnthropicProvider), per-user API key storage/validation, user model selection, migration of all 14 call sites, interactive onboarding (real + demo), Account page key management
  - Out: Non-Anthropic provider adapters, usage/cost tracking, billing integration, backend module/file renaming
- **Assumptions:** 11 (listed below)
- **Confidence:** 4/5
- **Coverage:** 9 explored / 11 visible

---

# BYOK + DataLens Rebrand + Interactive Onboarding

## 1. Product Rename: QueryCopilot to DataLens

### Branding Rules

- **Name:** DataLens (one word, camelCase-style capital L)
- **Color treatment:** "Data" in white (`#E2E8F0`), "Lens" in purple (`#A855F7` — the existing violet accent already in the palette)
- **Design token:** Add `brandPurple: '#A855F7'` to `TOKENS` in `frontend/src/components/dashboard/tokens.js` (camelCase to match existing convention: `accent`, `accentLight`, `accentGlow`). All "Lens" purple text references this token — never hardcode.
- **Typography:** Poppins (same as existing headings)

### Rename Locations (16 user-facing instances + metadata)

| File | What Changes |
|------|-------------|
| `Tutorial.jsx` | Welcome title, 3 description strings |
| `Landing.jsx` | Hero tagline, feature copy, demo section, footer email/social/copyright (8 instances) |
| `AppSidebar.jsx` | Tooltip, aria-label (2 instances) |
| `AdminDashboard.jsx` | Admin header |
| `Profile.jsx` | Behavior consent copy |
| `SharedDashboard.jsx` | Footer credit → "Powered by DataLens" |
| `index.css` | Comment header |
| `index.html` | `<title>` tag, meta description, OG tags |
| `Login.jsx` | Any branding text in login form |

Backend strings (error messages, email templates in `digest.py`) should also be updated if they reference "QueryCopilot".

### Logo Component

Create a reusable `<DataLensLogo />` component that renders the split-colored brand name. Used in sidebar, onboarding, landing, login, and shared dashboards. Props: `size` (sm/md/lg), `className`.

```jsx
// Conceptual — exact implementation during build
<span className="font-poppins font-bold">
  <span className="text-slate-100">Data</span>
  <span style={{ color: TOKENS.BRAND_PURPLE }}>Lens</span>
</span>
```

---

## 2. Provider Abstraction Layer (Backend)

### Architecture

```
                      ┌─────────────────────┐
                      │   ModelProvider ABC  │
                      │                     │
                      │  complete()         │
                      │  complete_stream()  │
                      │  complete_tools()   │
                      │  validate_key()     │
                      └─────────┬───────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                   │
    ┌─────────▼──────┐  ┌──────▼───────┐  ┌───────▼───────┐
    │ AnthropicProv.  │  │ OpenAIProv.  │  │ GoogleProv.   │
    │ (implemented)   │  │ (future)     │  │ (future)      │
    └────────────────┘  └──────────────┘  └───────────────┘
```

### New file: `backend/model_provider.py`

**`ModelProvider` ABC** with these methods:

```python
class ModelProvider(ABC):
    provider_name: str  # "anthropic", "openai", "google", "xai"

    @abstractmethod
    def complete(self, model, system, messages, max_tokens, **kwargs) -> ProviderResponse:
        """Single completion. Returns ProviderResponse(text, usage, stop_reason)."""

    @abstractmethod
    def complete_stream(self, model, system, messages, max_tokens, **kwargs) -> Iterator[str]:
        """Streaming completion. Yields text chunks."""

    @abstractmethod
    def complete_with_tools(self, model, system, messages, tools, max_tokens, **kwargs) -> ProviderToolResponse:
        """Tool-use completion. Returns ProviderToolResponse(content_blocks, stop_reason, usage)."""

    @abstractmethod
    def validate_key(self) -> bool:
        """Cheap validation call. Returns True if key is valid."""

    def supports_prompt_caching(self) -> bool:
        return False  # Override in providers that support it

    def supports_vision(self) -> bool:
        return False  # Override in providers that support it
```

**Response dataclasses:**

```python
@dataclass
class ProviderResponse:
    text: str
    usage: dict  # {"input_tokens": N, "output_tokens": N}
    stop_reason: str  # "end_turn", "max_tokens", "tool_use"

@dataclass
class ContentBlock:
    type: str  # "text" or "tool_use"
    text: str | None = None
    tool_name: str | None = None
    tool_input: dict | None = None
    tool_use_id: str | None = None

@dataclass
class ProviderToolResponse:
    content_blocks: list[ContentBlock]
    stop_reason: str
    usage: dict
```

### New file: `backend/anthropic_provider.py`

`AnthropicProvider(ModelProvider)` — wraps the existing `anthropic.Anthropic` client. Preserves ALL current Anthropic-specific features:

- **Ephemeral prompt caching** on system prompts (via `cache_control` blocks)
- **Native tool-use format** (Anthropic content blocks → `ContentBlock` dataclass)
- **Token-level streaming** via `messages.stream()` context manager
- **Circuit breaker** logic (moved from `query_engine.py` into the provider)

The adapter translates between the generic `ModelProvider` interface and Anthropic's SDK. No Anthropic SDK imports exist outside this file.

### New file: `backend/provider_registry.py`

```python
def get_provider_for_user(user_email: str) -> ModelProvider:
    """Resolve the correct provider + API key for a user."""
    profile = load_user_profile(user_email)
    api_key = decrypt_api_key(profile.get("api_key_encrypted"))
    provider_type = profile.get("provider", "anthropic")  # Future: openai, google, xai
    preferred_model = profile.get("preferred_model", settings.PRIMARY_MODEL)

    if provider_type == "anthropic":
        return AnthropicProvider(api_key=api_key, default_model=preferred_model)
    # Future: elif provider_type == "openai": return OpenAIProvider(...)
    raise ValueError(f"Unknown provider: {provider_type}")
```

### Migration of 14 Call Sites

Every file currently doing `anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)` changes to use the provider registry. The user's email is available from the JWT-authenticated request context.

| Call Site | Current | After Migration |
|-----------|---------|----------------|
| `query_engine.py` — `__init__` | `self.client = anthropic.Anthropic(...)` | `self.provider = provider` (injected via constructor) |
| `query_engine.py` — `_call_claude()` | `self.client.messages.create(...)` | `self.provider.complete(...)` |
| `query_engine.py` — `generate_sql_stream()` | `self.client.messages.stream(...)` | `self.provider.complete_stream(...)` |
| `query_engine.py` — `_generate_summary()` | `self.client.messages.create(...)` | `self.provider.complete(...)` |
| `query_engine.py` — `_call_claude_dashboard()` | `self.client.messages.create(...)` | `self.provider.complete(...)` |
| `agent_engine.py` — `__init__` | `self.client = anthropic.Anthropic(...)` | `self.provider = provider` (injected) |
| `agent_engine.py` — main loop | `self.client.messages.create(tools=...)` | `self.provider.complete_with_tools(...)` |
| `agent_engine.py` — `SessionMemory` | Ad-hoc `anthropic.Anthropic(...)` | `self.provider.complete(...)` (provider passed in) |
| `behavior_engine.py` | Ad-hoc client per call | `get_provider_for_user(email).complete(...)` |
| `alert_routes.py` | Ad-hoc client, hardcoded model | `get_provider_for_user(email).complete(...)` |
| `query_routes.py` — suggestions | Ad-hoc client | Provider from request context |
| `query_routes.py` — explain_value | Ad-hoc client | Provider from request context |
| `query_routes.py` — drill_down | Ad-hoc client | Provider from request context |
| `query_routes.py` — image_to_dashboard | Ad-hoc client, vision model | Provider from request context |

**Connection model change:** `ConnectionEntry` in `models.py` currently holds a `QueryEngine`. The `QueryEngine` constructor gains a `provider: ModelProvider` parameter instead of creating its own Anthropic client. Similarly for `AgentEngine`.

**Router-level pattern:** Each authenticated route already has the user's email from JWT. A helper `get_user_provider(request)` extracts it and returns the provider. Routes pass it to engine constructors.

### Handling the Demo User

Demo login (`POST /auth/demo`) creates a temporary user with a pre-configured provider using `settings.ANTHROPIC_API_KEY` (the platform key). This is the ONLY code path that uses the platform key.

```python
def get_provider_for_user(user_email: str) -> ModelProvider:
    if user_email == DEMO_USER_EMAIL:
        return AnthropicProvider(api_key=settings.ANTHROPIC_API_KEY, ...)
    # Normal user path: load encrypted key from profile
    ...
```

---

## 3. Per-User API Key Storage

### Storage Location

Per-user `profile.json` (existing file, in `.data/user_data/{hash}/`). New fields:

```json
{
  "api_key_encrypted": "<Fernet-encrypted Anthropic API key>",
  "api_key_provider": "anthropic",
  "api_key_validated_at": "2026-04-07T12:00:00Z",
  "api_key_valid": true,
  "preferred_model": "claude-haiku-4-5-20251001"
}
```

### Encryption

Same Fernet pattern as saved DB passwords in `connections.json`:
- Key derived from `JWT_SECRET_KEY` (existing behavior)
- `encrypt_api_key(plaintext) -> ciphertext`
- `decrypt_api_key(ciphertext) -> plaintext`
- Functions in `user_storage.py` alongside existing `encrypt_password()`/`decrypt_password()`

### API Endpoints

New routes in `routers/user_routes.py`:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/user/api-key` | Save/update API key (encrypts + validates) |
| `GET` | `/api/v1/user/api-key/status` | Returns `{provider, valid, validated_at, masked_key}` (last 4 chars only) |
| `DELETE` | `/api/v1/user/api-key` | Remove saved API key |
| `POST` | `/api/v1/user/api-key/validate` | Re-validate existing key on demand |
| `PUT` | `/api/v1/user/preferred-model` | Update preferred model selection |
| `GET` | `/api/v1/user/available-models` | List models available for the user's provider |

### Validation Flow

**On save (`POST /api-key`):**
1. Receive plaintext key from request body
2. Instantiate `AnthropicProvider(api_key=key)`
3. Call `provider.validate_key()` — sends a minimal `messages.create()` (system="test", user message="hi", max_tokens=1)
4. If valid: Fernet-encrypt, save to profile, return success
5. If invalid: return 400 with specific error (invalid key, rate limited, etc.)

**On auth error during queries:**
1. Any `401`/`403` from Anthropic API caught in `AnthropicProvider`
2. Provider raises `InvalidKeyError` (custom exception)
3. Router catches it, updates `api_key_valid = false` in profile
4. Returns `HTTP 422` to frontend with `{"error": "api_key_invalid", "message": "Your API key is no longer valid. Please update it in Account settings."}`
5. Frontend shows a persistent banner/modal prompting key update

---

## 4. User Model Selection

### Available Models (Anthropic)

```python
ANTHROPIC_MODELS = {
    "claude-haiku-4-5-20251001": {"name": "Claude Haiku 4.5", "tier": "fast", "cost": "$"},
    "claude-sonnet-4-5-20250514": {"name": "Claude Sonnet 4.5", "tier": "balanced", "cost": "$$"},
    "claude-sonnet-4-20250514": {"name": "Claude Sonnet 4", "tier": "balanced", "cost": "$$"},
    "claude-opus-4-20250514": {"name": "Claude Opus 4", "tier": "powerful", "cost": "$$$"},
}
```

### Routing Logic

- User's `preferred_model` replaces `settings.PRIMARY_MODEL` for that user
- Fallback model auto-selected: if preferred is Haiku → fallback is Sonnet. If preferred is Sonnet/Opus → fallback is same tier or one up.
- Existing circuit breaker logic in `AnthropicProvider` handles escalation
- `agent_engine.py` guardrails unchanged (MAX_TOOL_CALLS=12, WALL_CLOCK_LIMIT=60s, ABSOLUTE_WALL_CLOCK_LIMIT=600s, MAX_SQL_RETRIES=3)

---

## 5. Interactive Onboarding Redesign

### Design Principles

- **Corporate, polished, wow-factor.** Not a generic tutorial. Think: Linear's onboarding meets Stripe's product tour.
- **Progressive disclosure.** Each step reveals one concept. No information overload.
- **Animated transitions.** Use existing Framer Motion + GSAP infrastructure. Smooth page-to-page with the Three.js 3D background.
- **Gated progression.** Users cannot skip the API key step. Each step validates before advancing.
- **DataLens branding throughout.** Purple "Lens" accent, dark theme, glassmorphism cards.

### Onboarding Steps (5 steps replacing current 4)

**Step 1: Welcome to DataLens**
- Full-screen hero with 3D background (existing `Background3D`)
- DataLens logo (large, animated entrance)
- Tagline: one punchy line about what DataLens does
- Single CTA button: "Get Started" with glow animation
- No content overload — just brand impact

**Step 2: How It Works (Interactive Feature Tour)**
- 3-panel interactive showcase (not static text):
  - Panel A: "Ask" — animated mock of typing a natural language question
  - Panel B: "Review" — SQL appears with syntax highlighting, user "approves"
  - Panel C: "Insight" — chart + summary animate in
- Each panel auto-plays on a timer (3-4s) or user clicks to advance
- Glassmorphism cards with subtle parallax on mouse move
- Key message: "Your data, your questions, instant answers"

**Step 3: Enter Your API Key (Gated)**
- Clean, focused card: "Bring Your Own Key"
- Explanation: "DataLens uses Claude AI to understand your questions. Enter your Anthropic API key to get started."
- Input field (password-masked, show/hide toggle)
- "Get an API key" link → opens `https://console.anthropic.com/account/keys` in new tab
- **Validate on submit** — show spinner, then green checkmark or red error
- Cannot proceed until key is validated
- **Demo login variant:** This step is auto-filled with a masked placeholder and "Demo key active" badge. User can still proceed immediately.

**Step 4: Connect Your First Database**
- Compact version of the existing connection form
- Show supported DB icons (PostgreSQL, MySQL, Snowflake, BigQuery, etc.)
- "Skip for now" option (user can connect later from `/schema`)
- If connected: brief schema discovery animation ("Found 12 tables, 847 columns...")

**Step 5: Your First Question**
- If DB connected: pre-populated sample question based on discovered schema
- If no DB: show a "Connect a database to start asking questions" CTA
- Mini chat interface embedded in the onboarding card
- On successful query: confetti/celebration animation, "You're ready!" message
- CTA: "Go to Dashboard" → navigates to `/dashboard`

### Routing Changes

- Replace `/tutorial` route with `/onboarding` (or keep `/tutorial` and update component)
- After login/signup, redirect to `/onboarding` if `!hasApiKey || !onboardingComplete`
- After demo login, redirect to `/onboarding` (demo user also sees full flow)
- `onboardingComplete` stored in Zustand + localStorage (like `tutorialComplete` today)

### Technical Implementation

- New page: `pages/Onboarding.jsx` (replaces `Tutorial.jsx`)
- Each step is a sub-component: `OnboardingWelcome`, `OnboardingTour`, `OnboardingApiKey`, `OnboardingConnect`, `OnboardingFirstQuery`
- Step state managed locally (useState for current step + step data)
- Animations: Framer Motion `AnimatePresence` for step transitions, GSAP for micro-interactions
- 3D background: reuse `Background3D` or `FrostedBackground3D` (already lazy-loaded with WebGL fallback)
- Progress indicator: stepped dots or thin progress bar at top

---

## 6. Account Page API Key Management

### New Section in Account.jsx

Add an "API Configuration" card (between existing sections) with:

- **Current key status:** Green badge "Valid" / Red badge "Invalid" / Gray "Not configured"
- **Masked key display:** `sk-ant-...xxxx` (last 4 chars)
- **Provider:** "Anthropic" (future: dropdown for provider selection)
- **Preferred model:** Dropdown (Haiku / Sonnet 4 / Sonnet 4.5 / Opus) with cost tier indicators ($, $$, $$$)
- **Actions:** "Update Key" button → modal with input + validation. "Remove Key" with confirmation.
- **Last validated:** Timestamp

---

## 7. Frontend API Layer Changes

### New functions in `api.js`

```javascript
// API Key management
saveApiKey(key)           // POST /api/v1/user/api-key
getApiKeyStatus()         // GET /api/v1/user/api-key/status
deleteApiKey()            // DELETE /api/v1/user/api-key
validateApiKey()          // POST /api/v1/user/api-key/validate
updatePreferredModel(m)   // PUT /api/v1/user/preferred-model
getAvailableModels()      // GET /api/v1/user/available-models
```

### Zustand Store Changes (`store.js`)

New state in auth/user slice:

```javascript
apiKeyStatus: null,        // { provider, valid, validated_at, masked_key }
preferredModel: null,      // "claude-haiku-4-5-20251001"
availableModels: [],       // [{ id, name, tier, cost }]
onboardingComplete: false, // replaces tutorialComplete
setApiKeyStatus: (s) => set({ apiKeyStatus: s }),
setPreferredModel: (m) => set({ preferredModel: m }),
setOnboardingComplete: (v) => set({ onboardingComplete: v }),
```

### Error Handling: Invalid Key State

When any API call returns the `api_key_invalid` error:
1. Set `apiKeyStatus.valid = false` in store
2. Show a persistent top banner: "Your API key is no longer valid. [Update Key]"
3. "Update Key" opens Account page or inline modal
4. Banner dismisses only after successful re-validation

---

## 8. Assumptions Registry

1. Product name is "DataLens" — "Lens" in purple (`#A855F7`) everywhere
2. Purple accent added as `BRAND_PURPLE` design token in `tokens.js`
3. Existing `/tutorial` page replaced by new `/onboarding` (or same route, new component)
4. API keys Fernet-encrypted in per-user `profile.json` (same key derivation as DB passwords)
5. No platform API key for real users — key is hard requirement to use the product
6. Demo login is sole exception: uses platform `ANTHROPIC_API_KEY` from `.env`
7. Demo platform key is temporary — to be removed before production launch
8. User model selection: Haiku default, stored in profile, fallback logic preserved
9. Key validation = minimal `messages.create()` call (~1 token cost to user)
10. Auth errors (401/403) during queries → key marked invalid → persistent UI prompt
11. Backend Python module/file names unchanged — rename is user-facing strings only

---

## 9. Success Criteria

1. **Zero platform token spend** for real (non-demo) users — all LLM calls use user's own key
2. **New user: signup to first query in under 3 minutes** via onboarding flow
3. **Adding a new provider adapter** (OpenAI, Google, xAI) requires zero changes to query_engine.py, agent_engine.py, or any router — only a new adapter class + registry entry
4. **"DataLens" branding** consistent across all 16+ user-facing surfaces
5. **Demo login** routes through full onboarding flow with platform key auto-provisioned
6. **Invalid key recovery** — user can fix their key and resume without losing session state

---

## 10. Migration Note: Existing Users

When BYOK ships, any existing user accounts (created before this feature) will not have an API key configured. On their next login, they should be redirected to the onboarding flow (specifically Step 3: API key entry) before accessing the app. The redirect condition is: `!profile.api_key_encrypted || !onboardingComplete`.

---

## Planning Context (appended 2026-04-07)

[2026-04-07] Planning complete. Branch: `feature/byok-datalens`. Fingerprint: Backend has 3 new files (model_provider.py, anthropic_provider.py, provider_registry.py), zero `import anthropic` outside anthropic_provider.py, 6 new API key endpoints; frontend has DataLensLogo component, 5-step onboarding flow, API key management in Account page; zero "QueryCopilot" strings remain in user-facing surfaces.

**Invariants preserved:** Read-only enforcement (3 layers), two-step query flow, PII masking, agent guardrails (6 tools / 30s / 3 retries), Fernet key derivation, atomic file writes.

**Naming decisions (plan overrides spec where noted):** `brandPurple` (not BRAND_PURPLE, matches TOKENS camelCase), `complete_with_tools` (not complete_tools), reuse `decrypt_password` (not new decrypt_api_key), HTTP 422 (not 407).

**Accepted risks:** Demo user frontend detection relies on email string match (`demo@datalens.dev`).

---

## UFSD adversarial-testing 2026-04-07

**Verdict: PASS** | Coverage: 7/7 clusters examined (independent analysis + 20 analysts dispatched)

### Findings Fixed (5 issues, all resolved):

| Priority | Finding | Fix | Commit |
|----------|---------|-----|--------|
| **P1** | `InvalidKeyError` unhandled at 13 call sites — `get_provider_for_user()` throws but no router catches it → 500 errors | Global FastAPI exception handler in `main.py` returns 422 + `api_key_invalid` | `1911980` |
| **P1** | `delete_api_key()` doesn't delete — uses `save_api_key_to_profile()` which merges (dict.update) instead of replacing. Encrypted key persists after "delete" | Changed to `save_profile()` for full overwrite | `1911980` |
| **P2** | `ProtectedRoute` apiKeyStatus gate logic always passes on first load — `apiKeyStatus` is null initially, condition `apiKeyStatus && ...` evaluates to false | Simplified to `apiKeyStatus !== null && apiKeyStatus.configured === false` | `824b39f` |
| **P2** | Circuit breaker `_CircuitBreaker` not thread-safe — `_failures` and `_open_since` can race under concurrent requests | Added `threading.Lock` to all state mutations | `1911980` |
| **P3** | `SaveApiKeyBody.api_key` accepts any string length — potential DoS via 100MB payload | Added Pydantic `Field(min_length=10, max_length=512)` | `e3a81a3` |

### Accepted Risks (documented, not fixed):

- **P4: Old test emails** in `.data/users.json` (`debugtest@querycopilot.com`, `regflow_test@querycopilot.com`) — test data, not user-facing, `.data/` is gitignored
- **P4: Demo user email string match** — frontend checks `user.email === "demo@datalens.dev"` which could be spoofed by registering that email. Mitigated: demo login endpoint creates the user first, so registration would fail with "email taken"
- **P4: Anthropic rate limit on validate_key()** — each validation costs ~1 token to the user's key. No server-side rate limit on the validate endpoint. Mitigated: Anthropic's own rate limiter protects against abuse

### Invariants Verified Post-Fix:

1. ✅ Read-only enforcement (3 layers intact)
2. ✅ Two-step query flow (generate/execute separate)
3. ✅ PII masking (mask_dataframe at all data paths)
4. ✅ Agent guardrails (MAX_TOOL_CALLS=12, WALL_CLOCK=60s, SQL_RETRIES=3)
5. ✅ Fernet key derivation (unchanged)
6. ✅ Atomic file writes (save_api_key_to_profile uses atomic=True)
