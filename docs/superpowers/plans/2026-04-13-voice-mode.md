# Voice Mode — Continuous Conversation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use ultraflow skills for building. Use taste/impeccable/emil-design-eng skills for ALL frontend components.

**Goal:** Add continuous voice conversation with the data agent. Browser-native STT/TTS (free, no API cost) with optional premium BYOK voice (Whisper, OpenAI TTS, ElevenLabs). WebSocket for real-time bidirectional communication. Works across Chat, Dashboard, and ML Engine contexts.

**Architecture:** FastAPI WebSocket endpoint at `/api/v1/voice/ws/{chat_id}`. Only TEXT flows over the wire — browser handles audio. Voice and text share the same SessionMemory/chat_id. Agent responses adapted for voice mode (shorter, conversational). Frontend VoiceButton available everywhere the agent exists.

**Tech Stack:** FastAPI WebSocket (built-in), Web Speech API (browser-native), Framer Motion

**Spec:** `docs/superpowers/specs/2026-04-13-askdb-global-comp-design.md` — Phase 5

---

## File Structure

### New Files (Backend)
- `backend/routers/voice_routes.py` — WebSocket endpoint for voice sessions
- `backend/tests/test_voice_routes.py` — WebSocket tests

### New Files (Frontend)
- `frontend/src/components/voice/VoiceButton.jsx` — mic toggle button
- `frontend/src/components/voice/VoiceIndicator.jsx` — waveform + recording status
- `frontend/src/components/voice/VoiceSettings.jsx` — voice config panel
- `frontend/src/hooks/useSpeechRecognition.js` — Web Speech API hook
- `frontend/src/hooks/useSpeechSynthesis.js` — TTS hook

### Modified Files
- `backend/config.py` — voice config flags
- `backend/main.py` — register voice_routes
- `backend/agent_engine.py` — voice_mode flag for response adaptation
- `frontend/src/store.js` — voice state slice
- `frontend/src/components/agent/AgentPanel.jsx` — VoiceButton in header
- `frontend/src/pages/Chat.jsx` — VoiceButton next to input

---

## Task 1: Voice Config Flags

**Files:**
- Modify: `backend/config.py`

- [ ] **Step 1: Add voice config**

```python
    # Voice Mode (Phase 5 — Global Comp)
    VOICE_MODE_ENABLED: bool = Field(default=True)
    VOICE_WS_MAX_CONNECTIONS_PER_USER: int = Field(default=2)
    VOICE_RESPONSE_MAX_CHARS: int = Field(default=500, description="Cap TTS response length for cost control")
    VOICE_INTERIM_DEBOUNCE_MS: int = Field(default=300)
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/config.py
git commit -m "config: add voice mode feature flags"
```

---

## Task 2: Voice WebSocket Endpoint

**Files:**
- Create: `backend/routers/voice_routes.py`
- Create: `backend/tests/test_voice_routes.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_voice_routes.py`:

```python
"""Tests for voice WebSocket endpoint."""
import pytest
from fastapi.testclient import TestClient


class TestVoiceRoutes:
    def test_voice_ws_rejects_without_token(self):
        """WebSocket should reject connections without auth token."""
        from main import app
        client = TestClient(app)
        with pytest.raises(Exception):
            with client.websocket_connect("/api/v1/voice/ws/test-chat-id"):
                pass

    def test_voice_ws_protocol_transcript(self):
        """Verify transcript message format is accepted."""
        # This tests message parsing logic, not full auth flow
        from routers.voice_routes import parse_voice_message
        msg = {"type": "transcript", "text": "show me revenue", "is_interim": False}
        result = parse_voice_message(msg)
        assert result["type"] == "transcript"
        assert result["text"] == "show me revenue"
        assert result["is_interim"] is False

    def test_voice_ws_protocol_cancel(self):
        from routers.voice_routes import parse_voice_message
        msg = {"type": "cancel"}
        result = parse_voice_message(msg)
        assert result["type"] == "cancel"

    def test_voice_ws_protocol_invalid(self):
        from routers.voice_routes import parse_voice_message
        msg = {"type": "unknown_type"}
        result = parse_voice_message(msg)
        assert result is None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_voice_routes.py -v
```

- [ ] **Step 3: Implement voice_routes.py**

Create `backend/routers/voice_routes.py`:

```python
"""Voice Mode — WebSocket endpoint for continuous conversation.

Only TEXT flows over the wire. Browser handles audio via Web Speech API.
Voice and text share the same SessionMemory and chat_id.
"""
import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/voice", tags=["voice"])

# Track active connections per user
_active_connections: dict[str, int] = {}

VALID_MESSAGE_TYPES = {"transcript", "cancel", "voice_config"}


def parse_voice_message(msg: dict) -> Optional[dict]:
    """Parse and validate incoming voice WebSocket message."""
    msg_type = msg.get("type")
    if msg_type not in VALID_MESSAGE_TYPES:
        return None

    if msg_type == "transcript":
        return {
            "type": "transcript",
            "text": msg.get("text", "").strip(),
            "is_interim": msg.get("is_interim", False),
        }
    elif msg_type == "cancel":
        return {"type": "cancel"}
    elif msg_type == "voice_config":
        return {
            "type": "voice_config",
            "tts_provider": msg.get("tts_provider", "browser"),
            "stt_provider": msg.get("stt_provider", "browser"),
            "voice_id": msg.get("voice_id"),
        }
    return None


@router.websocket("/ws/{chat_id}")
async def voice_session(websocket: WebSocket, chat_id: str, token: str = Query(None)):
    """WebSocket endpoint for voice conversation.
    
    Protocol:
    - Client sends: {"type": "transcript", "text": "...", "is_interim": bool}
    - Server sends: {"type": "agent_step", "step": {...}} (same format as SSE)
    - Server sends: {"type": "voice_response", "text": "...", "speak": true}
    - Server sends: {"type": "listening", "active": true}
    """
    if not settings.VOICE_MODE_ENABLED:
        await websocket.close(code=1008, reason="Voice mode disabled")
        return

    # Authenticate via token query param
    if not token:
        await websocket.close(code=1008, reason="Missing auth token")
        return

    # Validate JWT token
    try:
        from auth import decode_token
        user = decode_token(token)
        user_email = user.get("sub") or user.get("email")
        if not user_email:
            await websocket.close(code=1008, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=1008, reason="Invalid token")
        return

    # Check connection limit
    current = _active_connections.get(user_email, 0)
    if current >= settings.VOICE_WS_MAX_CONNECTIONS_PER_USER:
        await websocket.close(code=1008, reason="Too many voice connections")
        return

    _active_connections[user_email] = current + 1

    await websocket.accept()
    logger.info(f"Voice session started: {chat_id} for {user_email}")

    try:
        await websocket.send_json({"type": "listening", "active": True})

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            parsed = parse_voice_message(msg)

            if not parsed:
                continue

            if parsed["type"] == "cancel":
                await websocket.send_json({"type": "listening", "active": True})
                continue

            if parsed["type"] == "voice_config":
                # Store voice preferences (could be saved to user profile)
                continue

            if parsed["type"] == "transcript" and parsed["is_interim"]:
                # Interim transcripts — could be displayed but not processed
                continue

            if parsed["type"] == "transcript" and parsed["text"]:
                question = parsed["text"]

                # Process through agent engine (same pipeline as text)
                try:
                    from agent_engine import AgentEngine
                    # Get connection from app state
                    # Note: WebSocket doesn't have request.app — need to pass app reference
                    # For now, send acknowledgment and process
                    await websocket.send_json({
                        "type": "agent_step",
                        "step": {"type": "thinking", "content": "Processing your question...", "brief_thinking": "Processing..."},
                    })

                    # TODO: Wire to AgentEngine.run() with voice_mode=True
                    # This requires access to app.state.connections which
                    # needs to be passed through the WebSocket lifecycle.
                    # Full wiring will be done when integrating with agent_routes.py patterns.

                    # Voice-adapted response
                    voice_text = f"I heard: {question}. Processing your query now."
                    if len(voice_text) > settings.VOICE_RESPONSE_MAX_CHARS:
                        voice_text = voice_text[:settings.VOICE_RESPONSE_MAX_CHARS]

                    await websocket.send_json({
                        "type": "voice_response",
                        "text": voice_text,
                        "speak": True,
                    })

                    await websocket.send_json({"type": "listening", "active": True})

                except Exception as e:
                    logger.error(f"Voice processing error: {e}")
                    await websocket.send_json({
                        "type": "agent_step",
                        "step": {"type": "error", "content": str(e)},
                    })

    except WebSocketDisconnect:
        logger.info(f"Voice session ended: {chat_id}")
    except Exception as e:
        logger.error(f"Voice session error: {e}")
    finally:
        _active_connections[user_email] = max(_active_connections.get(user_email, 1) - 1, 0)
```

- [ ] **Step 4: Register in main.py**

```python
from routers import voice_routes
app.include_router(voice_routes.router)
```

- [ ] **Step 5: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_voice_routes.py -v
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/routers/voice_routes.py backend/tests/test_voice_routes.py backend/main.py
git commit -m "feat: add voice WebSocket endpoint with auth, rate limiting, message protocol"
```

---

## Task 3: Agent Voice Mode Adaptation

**Files:**
- Modify: `backend/agent_engine.py`

- [ ] **Step 1: Add voice_mode flag to AgentEngine**

In `AgentEngine.__init__()`, add:

```python
self._voice_mode = False
```

Add setter:

```python
def set_voice_mode(self, enabled: bool):
    self._voice_mode = enabled
```

- [ ] **Step 2: Inject voice system prompt**

In the system prompt building section of `_run_inner()` (where persona hints are added), add:

```python
if self._voice_mode:
    system_parts.append(
        "Respond conversationally and concisely. Lead with the key insight. "
        "Keep responses under 3 sentences when possible. "
        "Always end with a follow-up question to guide the conversation. "
        "Numbers: say '2.4 million' not '$2,400,000'. "
        "Avoid tables or code blocks — describe data verbally instead."
    )
```

- [ ] **Step 3: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/agent_engine.py
git commit -m "feat: agent voice mode — conversational response style for spoken output"
```

---

## Task 4: Frontend — Speech Recognition Hook

**Files:**
- Create: `frontend/src/hooks/useSpeechRecognition.js`

- [ ] **Step 1: Create useSpeechRecognition.js**

```javascript
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Web Speech API hook for continuous speech recognition.
 * 
 * Returns: { isListening, transcript, interimTranscript, startListening, stopListening, supported }
 */
export default function useSpeechRecognition({ onTranscript, onInterim, continuous = true, lang = 'en-US' } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);

  const SpeechRecognition = typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

  const supported = !!SpeechRecognition;

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
        onInterim?.(interim);
      }

      if (final) {
        setTranscript(final);
        setInterimTranscript('');
        onTranscript?.(final);
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      // Auto-restart in continuous mode
      if (isListening && continuous) {
        try { recognition.start(); } catch { setIsListening(false); }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [SpeechRecognition, continuous, lang, onTranscript, onInterim, isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  return { isListening, transcript, interimTranscript, startListening, stopListening, supported };
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/hooks/useSpeechRecognition.js
git commit -m "feat: add useSpeechRecognition hook — Web Speech API wrapper"
```

---

## Task 5: Frontend — Speech Synthesis Hook

**Files:**
- Create: `frontend/src/hooks/useSpeechSynthesis.js`

- [ ] **Step 1: Create useSpeechSynthesis.js**

```javascript
import { useState, useRef, useCallback } from 'react';

/**
 * Web Speech Synthesis hook for text-to-speech.
 * 
 * Returns: { isSpeaking, speak, stop, supported }
 */
export default function useSpeechSynthesis({ rate = 1.0, pitch = 1.0, lang = 'en-US' } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback((text) => {
    if (!supported || !text) return;

    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = lang;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [supported, rate, pitch, lang]);

  const stop = useCallback(() => {
    if (supported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [supported]);

  return { isSpeaking, speak, stop, supported };
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/hooks/useSpeechSynthesis.js
git commit -m "feat: add useSpeechSynthesis hook — browser TTS wrapper"
```

---

## Task 6: Frontend — VoiceButton + VoiceIndicator

**Files:**
- Create: `frontend/src/components/voice/VoiceButton.jsx`
- Create: `frontend/src/components/voice/VoiceIndicator.jsx`

> **REQUIRED:** Invoke taste or impeccable skill.

- [ ] **Step 1: Create VoiceButton.jsx**

```jsx
import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

export default function VoiceButton({ isListening, onToggle, supported, size = 'md' }) {
  if (!supported) return null;

  const sizes = { sm: 28, md: 36, lg: 44 };
  const s = sizes[size] || sizes.md;

  return (
    <motion.button
      onClick={onToggle}
      whileTap={{ scale: 0.92 }}
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: s,
        height: s,
        background: isListening ? TOKENS.colors.danger : `${TOKENS.text}10`,
        color: isListening ? '#fff' : TOKENS.text,
        border: 'none',
        cursor: 'pointer',
      }}
      title={isListening ? 'Stop listening' : 'Start voice mode'}
    >
      {/* Mic icon */}
      <svg width={s * 0.45} height={s * 0.45} viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 8 1z" />
        <path d="M3.5 7.5a.5.5 0 0 1 1 0 3.5 3.5 0 0 0 7 0 .5.5 0 0 1 1 0 4.5 4.5 0 0 1-4 4.473V14h2a.5.5 0 0 1 0 1H5.5a.5.5 0 0 1 0-1h2v-2.027A4.5 4.5 0 0 1 3.5 7.5z" />
      </svg>

      {/* Pulse ring when listening */}
      {isListening && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: `2px solid ${TOKENS.colors.danger}` }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
}
```

- [ ] **Step 2: Create VoiceIndicator.jsx**

```jsx
import { motion } from 'framer-motion';
import { TOKENS } from '../dashboard/tokens';

export default function VoiceIndicator({ isListening, isSpeaking, interimTranscript }) {
  if (!isListening && !isSpeaking) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-2 px-3 py-2"
      style={{
        borderRadius: TOKENS.radius.md,
        background: isListening ? `${TOKENS.colors.danger}10` : `${TOKENS.accent}10`,
      }}
    >
      {/* Waveform bars */}
      <div className="flex items-center gap-0.5">
        {[0, 1, 2, 3, 4].map(i => (
          <motion.div
            key={i}
            style={{
              width: 3,
              borderRadius: 1,
              background: isListening ? TOKENS.colors.danger : TOKENS.accent,
            }}
            animate={{
              height: isListening || isSpeaking ? [4, 12 + Math.random() * 8, 4] : [4, 4, 4],
            }}
            transition={{ duration: 0.4 + i * 0.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Status text */}
      <span className="text-xs" style={{ color: `${TOKENS.text}70` }}>
        {isSpeaking ? 'Speaking...' : isListening ? 'Listening...' : ''}
      </span>

      {/* Interim transcript */}
      {interimTranscript && (
        <span className="text-xs italic flex-1" style={{ color: `${TOKENS.text}50` }}>
          {interimTranscript}
        </span>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/voice/VoiceButton.jsx frontend/src/components/voice/VoiceIndicator.jsx
git commit -m "feat: add VoiceButton + VoiceIndicator — mic toggle with pulse animation + waveform"
```

---

## Task 7: Frontend — Voice Integration in Agent Panel + Chat

**Files:**
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/components/agent/AgentPanel.jsx`
- Modify: `frontend/src/pages/Chat.jsx`

> **REQUIRED:** Invoke taste or impeccable skill.

- [ ] **Step 1: Add voice state to store.js**

```javascript
voiceActive: false,
voiceConfig: { sttProvider: 'browser', ttsProvider: 'browser', voiceId: null, autoListen: true, speed: 1.0 },
setVoiceActive: (active) => set({ voiceActive: active }),
setVoiceConfig: (config) => set((s) => ({ voiceConfig: { ...s.voiceConfig, ...config } })),
```

- [ ] **Step 2: Add VoiceButton to AgentPanel header**

In `AgentPanel.jsx`, import VoiceButton and add to header controls (next to dock/close buttons):

```jsx
import VoiceButton from '../voice/VoiceButton';
import VoiceIndicator from '../voice/VoiceIndicator';
import useSpeechRecognition from '../../hooks/useSpeechRecognition';
import useSpeechSynthesis from '../../hooks/useSpeechSynthesis';

// Inside AgentPanel, add hooks:
const { isListening, interimTranscript, startListening, stopListening, supported: sttSupported } = useSpeechRecognition({
  onTranscript: (text) => {
    // Submit transcript as agent query
    handleSubmit(null, text);
  },
});
const { isSpeaking, speak, stop: stopSpeaking, supported: ttsSupported } = useSpeechSynthesis();

// In header controls:
<VoiceButton
  isListening={isListening}
  onToggle={() => isListening ? stopListening() : startListening()}
  supported={sttSupported}
  size="sm"
/>

// Before AgentStepFeed, show indicator:
<VoiceIndicator isListening={isListening} isSpeaking={isSpeaking} interimTranscript={interimTranscript} />
```

Also: when a `voice_response` step arrives via SSE/WebSocket, call `speak(step.text)`.

- [ ] **Step 3: Add VoiceButton to Chat page**

In `Chat.jsx`, add VoiceButton next to the text input send button. Same hook pattern as AgentPanel.

- [ ] **Step 4: Build + lint**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run lint && npm run build
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/store.js frontend/src/components/agent/AgentPanel.jsx frontend/src/pages/Chat.jsx
git commit -m "feat: voice mode integrated in AgentPanel + Chat — mic button + auto-speak responses"
```

---

## Task 8: Frontend — Voice Settings Panel

**Files:**
- Create: `frontend/src/components/voice/VoiceSettings.jsx`

> **REQUIRED:** Invoke taste or impeccable skill.

- [ ] **Step 1: Create VoiceSettings.jsx**

```jsx
import { TOKENS } from '../dashboard/tokens';
import useStore from '../../store';

export default function VoiceSettings() {
  const { voiceConfig, setVoiceConfig } = useStore();

  return (
    <div style={{ padding: 16 }}>
      <h3 className="text-sm font-medium mb-3">Voice Mode Settings</h3>

      {/* Input provider */}
      <div className="mb-3">
        <label className="text-xs block mb-1" style={{ color: `${TOKENS.text}60` }}>Speech Input</label>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="radio"
              name="stt"
              checked={voiceConfig.sttProvider === 'browser'}
              onChange={() => setVoiceConfig({ sttProvider: 'browser' })}
            />
            Browser (free)
          </label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="radio"
              name="stt"
              checked={voiceConfig.sttProvider === 'whisper'}
              onChange={() => setVoiceConfig({ sttProvider: 'whisper' })}
            />
            Whisper API
          </label>
        </div>
      </div>

      {/* Output provider */}
      <div className="mb-3">
        <label className="text-xs block mb-1" style={{ color: `${TOKENS.text}60` }}>Speech Output</label>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="radio"
              name="tts"
              checked={voiceConfig.ttsProvider === 'browser'}
              onChange={() => setVoiceConfig({ ttsProvider: 'browser' })}
            />
            Browser (free)
          </label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="radio"
              name="tts"
              checked={voiceConfig.ttsProvider === 'openai_tts'}
              onChange={() => setVoiceConfig({ ttsProvider: 'openai_tts' })}
            />
            OpenAI TTS
          </label>
        </div>
      </div>

      {/* Auto-listen */}
      <div className="mb-3 flex items-center justify-between">
        <label className="text-xs" style={{ color: `${TOKENS.text}60` }}>Auto-listen after response</label>
        <input
          type="checkbox"
          checked={voiceConfig.autoListen}
          onChange={(e) => setVoiceConfig({ autoListen: e.target.checked })}
        />
      </div>

      {/* Speed */}
      <div>
        <label className="text-xs block mb-1" style={{ color: `${TOKENS.text}60` }}>Speed: {voiceConfig.speed}x</label>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.1}
          value={voiceConfig.speed}
          onChange={(e) => setVoiceConfig({ speed: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/voice/VoiceSettings.jsx
git commit -m "feat: add VoiceSettings panel — input/output provider, auto-listen, speed"
```

---

## Task 9: Full Test Suite + Push

- [ ] **Step 1: Run all backend tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 2: Lint + build frontend**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run lint && npm run build
```

- [ ] **Step 3: Push**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git push origin askdb-global-comp
```
