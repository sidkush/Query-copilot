# Predictive User Behavior Intelligence System

## Spec — Locked 2026-04-05

### What We're Building
A predictive intelligence layer that tracks user behavior within sessions, compacts it to abstract intents, purges raw data, and uses the compacted profile to predict the user's next action — delivering 3 "wow factor" suggestions after every response.

### Architecture
- **Hybrid client+server**: Raw signals captured client-side, compacted every 15-20 min, raw purged
- **Session-Track → Compact → Purge**: Only abstract intents persist server-side
- **Rules + Claude hybrid**: Deterministic predictions (frequency, time, persona) handled by local rules engine; semantic predictions (disambiguation, style matching) use Claude API
- **Pre-capture consent gate**: No signals captured before explicit opt-in
- **Two-stage PII scrubber**: Client strips names/columns → server runs pii_masking on intents before Claude injection
- **Feature flags per feature**: Any feature killable independently via config.py

### 21 Features (Dependency Order)

| # | Feature | Depends On | Description |
|---|---------|-----------|-------------|
| 1 | 3 Predictive Suggestions | — | After every response, suggest 3 most likely next actions from query history + schema |
| 2 | Session Behavior Tracking | 1 | Client-side signal capture (hover, scroll, typing) with pre-capture consent gate |
| 3 | Opt-in Consent Flow | 2 | 2-tier consent: Level 1 (personal predictions), Level 2 (collaborative). Off by default |
| 4 | Adaptive Query Complexity | 1 | Detect user skill level from query patterns, adjust SQL complexity accordingly |
| 5 | Time-Aware Predictions | 1 | "Monday morning → revenue check" patterns from compacted time signals |
| 6 | Auto-Connection Switching | 5 | Predict which DB connection user will switch to next based on workflow patterns |
| 7 | Proactive Anomaly Alerts | 1, 5 | "Revenue is 23% below your typical Monday" based on query baselines |
| 8 | Smart Dashboard Pre-loading | 5 | Pre-fetch predicted tile data based on interaction order patterns |
| 9 | "Continue Your Thought" | 2 | Client-side typing prediction/autocomplete from session signals |
| 10 | Analyst Persona Profiles | 2, 4 | Classify user as Explorer/Auditor/Storyteller, adapt UI accordingly |
| 11 | Cross-Session Insight Chains | 2 | "You never finished investigating churn last Tuesday — pick up?" |
| 12 | Collaborative Prediction | 2, 3 | Anonymous cross-user pattern matching. Separate unencrypted profile store |
| 13 | NL Style Matching | 2, 10 | Match summary tone to user's communication style |
| 14 | Predictive Data Prep | 5, 8 | Pre-cache predicted queries via server-side cron |
| 15 | Intent Disambiguation | 1, 4 | "growth" → "revenue growth (85% of your uses)" based on term→meaning map |
| 16 | Workflow Templates | 2, 11 | Detect repeated multi-step patterns, offer to save as one-click workflows |
| 17 | Skill Gap Detection | 4 | Notice unused SQL patterns, gently suggest after 50+ queries |
| 18 | Agent Chat History | — | DONE ✓ — localStorage persistence, history list, conversation switching |
| 19 | Agent Dashboard Control | 18 | Agent tools: create_tile, edit_tile, move_tile, delete_tile, format_tile |
| 20 | Permission System | 19 | Supervised (ask before each mutation) vs Autonomous. Always ask for delete/modify |
| 21 | Analyst Persona Tone | 4, 10 | Immutable corporate tone based on DB type. Prompt-injection-proof. Admin-only override |

### Key Mitigations (Non-Negotiable)
1. Pre-capture consent gate — BIPA compliance
2. Two-stage PII scrubber — Client + server, before Claude API
3. Separate file locks per concern — behavior_profile.json gets own lock
4. Phase 1 works without opt-in — derives from existing query_stats.json
5. Feature flags per feature — kill switch in config.py
6. BroadcastChannel for multi-tab coordination
7. localStorage budget: agent history 2MB, behavior 1MB, other 500KB
8. Decay function: 2-week half-life on behavior signals
9. Dashboard version counter for agent mutation safety
10. Shadow mode first 30 days for compaction quality tuning

### Compliance
- GDPR: Compliant with pre-capture consent + right to delete + DPIA
- CCPA: Compliant with opt-in + deletion on request
- BIPA: Compliant with pre-capture consent gate + jurisdiction detection
- HIPAA: Compliant with two-stage PII scrubber (18 Safe Harbor identifiers)
- SOC 2: Compliant with audit trail + automated retention + feature flags
- ePrivacy: Compliant with session-only raw storage + opt-in

### Success Metrics
- Suggestion click-through rate > 15% (kill signal: < 15% after 500 impressions)
- Opt-in rate > 20% for Level 1 tracking
- Prediction accuracy > 50% for returning users (measured by implicit acceptance signals)
- Zero PII leakage in Claude API prompts (audited weekly)

### Scale Thresholds
- ~500 users: Monitor file I/O latency
- ~1000 users: Evaluate migration to SQLite/Redis for behavior store
- ~5000 users: Collaborative prediction becomes viable
- ~10000 users: Full DB migration required

### Files Modified (Estimated)
| File | Scope |
|------|-------|
| `backend/behavior_engine.py` | NEW — compaction pipeline, PII scrubber, profile management |
| `backend/config.py` | Feature flags for each of 21 features |
| `backend/agent_engine.py` | New dashboard tools, behavior context injection, analyst tone |
| `backend/routers/query_routes.py` | Prediction endpoint, suggestion generation |
| `backend/routers/consent_routes.py` | NEW — consent management CRUD |
| `backend/user_storage.py` | Behavior profile persistence with separate lock |
| `backend/pii_masking.py` | Extended to scrub behavioral intent strings |
| `frontend/src/store.js` | Behavior slice, consent slice, prediction state |
| `frontend/src/lib/behaviorEngine.js` | NEW — client-side signal capture + compaction |
| `frontend/src/lib/rulesEngine.js` | NEW — deterministic prediction rules |
| `frontend/src/components/agent/AgentPanel.jsx` | Dashboard control UI, permission toggles |
| `frontend/src/components/dashboard/` | Tile mutation handlers for agent control |
