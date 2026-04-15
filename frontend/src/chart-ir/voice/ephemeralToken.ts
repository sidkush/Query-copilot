/**
 * Ephemeral token helper — Phase 3 scaffolding.
 *
 * Mints a short-lived token from the backend (`POST /api/v1/voice/session`)
 * that the browser passes to the chosen voice tier (Deepgram / OpenAI
 * Realtime) when opening its WebSocket. The backend holds the real
 * vendor API key (Fernet-encrypted per user) and uses it to sign the
 * ephemeral token so the secret never leaves the server.
 *
 * Phase 3 stub hits a POST endpoint with the JWT from localStorage and
 * returns the response body. The real vendor-specific mint logic lives
 * in `backend/voice_registry.py`.
 */
import type { VoiceTier } from './voiceProvider';

export interface EphemeralTokenResponse {
  tier: VoiceTier;
  token: string;
  expiresAt: number;
}

export async function mintEphemeralToken(tier: VoiceTier): Promise<EphemeralTokenResponse> {
  const jwt =
    typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch('/api/v1/voice/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ tier }),
  });
  if (!res.ok) {
    throw new Error(`Failed to mint ephemeral token for tier '${tier}': ${res.status}`);
  }
  const body = (await res.json()) as EphemeralTokenResponse;
  return body;
}
