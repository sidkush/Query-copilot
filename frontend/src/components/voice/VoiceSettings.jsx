import { TOKENS } from '../dashboard/tokens';
import { useStore } from '../../store';

export default function VoiceSettings() {
  const voiceConfig = useStore((s) => s.voiceConfig);
  const setVoiceConfig = useStore((s) => s.setVoiceConfig);

  return (
    <div style={{ padding: 16 }}>
      <h3 className="text-sm font-medium mb-3" style={{ color: TOKENS.text.primary }}>Voice Settings</h3>

      <div className="mb-3">
        <label className="text-xs block mb-1" style={{ color: TOKENS.text.muted }}>Speech Input</label>
        <div className="flex gap-3">
          {[{ v: 'browser', l: 'Browser (free)' }, { v: 'whisper', l: 'Whisper API' }].map(o => (
            <label key={o.v} className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: TOKENS.text.secondary }}>
              <input type="radio" name="stt" checked={voiceConfig.sttProvider === o.v}
                onChange={() => setVoiceConfig({ sttProvider: o.v })} />
              {o.l}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <label className="text-xs block mb-1" style={{ color: TOKENS.text.muted }}>Speech Output</label>
        <div className="flex gap-3">
          {[{ v: 'browser', l: 'Browser (free)' }, { v: 'openai_tts', l: 'OpenAI TTS' }].map(o => (
            <label key={o.v} className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: TOKENS.text.secondary }}>
              <input type="radio" name="tts" checked={voiceConfig.ttsProvider === o.v}
                onChange={() => setVoiceConfig({ ttsProvider: o.v })} />
              {o.l}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <label className="text-xs" style={{ color: TOKENS.text.muted }}>Auto-listen after response</label>
        <input type="checkbox" checked={voiceConfig.autoListen}
          onChange={(e) => setVoiceConfig({ autoListen: e.target.checked })} />
      </div>

      <div>
        <label className="text-xs block mb-1" style={{ color: TOKENS.text.muted }}>Speed: {voiceConfig.speed}x</label>
        <input type="range" min={0.5} max={2.0} step={0.1} value={voiceConfig.speed}
          onChange={(e) => setVoiceConfig({ speed: parseFloat(e.target.value) })}
          className="w-full" />
      </div>
    </div>
  );
}
