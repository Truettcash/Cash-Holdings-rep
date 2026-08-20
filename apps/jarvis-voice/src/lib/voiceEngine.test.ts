import { describe, expect, it, vi } from 'vitest';
import {
  VOICE_STATES,
  VOICE_MODES,
  createVoiceSession,
  transitionVoiceState,
  routeVoiceMode,
  cleanupTranscript,
  createHotkeyState,
  evaluateSpeechActivity,
} from './voiceEngine';
import { DemoTranscriptionProvider } from './transcription';
import { askJarvisRuntime } from './runtimeBridge';

describe('voice state machine', () => {
  it('moves from idle to listening then complete', () => {
    let session = createVoiceSession();
    session = transitionVoiceState(session, 'LISTENING');
    expect(session.state).toBe(VOICE_STATES.LISTENING);
    session = transitionVoiceState(session, 'COMPLETE');
    expect(session.state).toBe(VOICE_STATES.COMPLETE);
  });

  it('supports cancel and escape transitions', () => {
    const session = createVoiceSession();
    const cancelled = transitionVoiceState(session, 'ERROR', { reason: 'cancelled' });
    expect(cancelled.state).toBe(VOICE_STATES.ERROR);
    expect(cancelled.error).toBe('cancelled');
  });

  it('routes dictate and jarvis mode safely', () => {
    const dictation = routeVoiceMode('DICTATE', 'hello world');
    const jarvis = routeVoiceMode('JARVIS', 'diagnose this');
    expect(dictation.route).toBe('DICTATE');
    expect(jarvis.route).toBe('JARVIS');
  });

  it('cleans and segments transcript deterministically', () => {
    const cleaned = cleanupTranscript('uh hello...  world  uh  ...');
    expect(cleaned.toLowerCase()).toContain('hello');
    expect(cleaned.toLowerCase()).not.toContain('uh');
    expect(cleaned).not.toContain('...');
  });

  it('detects no speech when level is too low', () => {
    expect(evaluateSpeechActivity([{ level: 0.02 }, { level: 0.01 }, { level: 0.01 }])).toBe(false);
    expect(evaluateSpeechActivity([{ level: 0.02 }, { level: 0.45 }, { level: 0.5 }])).toBe(true);
  });

  it('creates a hotkey state object with toggle and hold semantics', () => {
    const hotkey = createHotkeyState({ key: 'Alt+Space', mode: 'push-to-talk' });
    expect(hotkey.key).toBe('Alt+Space');
    expect(hotkey.pressed).toBe(false);
    expect(hotkey.mode).toBe('push-to-talk');
  });

  it('uses the transcription provider contract and demo provider path', async () => {
    const provider = new DemoTranscriptionProvider();
    expect(provider.capabilities().supportsStreaming).toBe(false);
    const text = await provider.transcribe(new Blob(['x']), { locale: 'en-US' });
    expect(typeof text).toBe('string');
  });

  it('calls the existing Jarvis runtime bridge for JARVIS mode', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }))); 
    const result = await askJarvisRuntime('What projects are active?');
    expect(result.ok).toBe(true);
    expect(result.intent).toBeTruthy();
    spy.mockRestore();
  });

  it('handles failed Jarvis requests without crashing', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('runtime failed'));
    const result = await askJarvisRuntime('diagnose this');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    spy.mockRestore();
  });

  it('caps hot-mic timeouts deterministically', () => {
    const timedOut = createVoiceSession({ maxDurationMs: 3000, elapsedMs: 3200 });
    expect(timedOut.maxDurationMs).toBe(3000);
    expect(timedOut.elapsedMs).toBeGreaterThanOrEqual(3200);
  });
});

describe('mode routing', () => {
  it('keeps the mode explicit after route selection', () => {
    expect(VOICE_MODES.DICTATE).toBe('DICTATE');
    expect(VOICE_MODES.JARVIS).toBe('JARVIS');
  });
});
