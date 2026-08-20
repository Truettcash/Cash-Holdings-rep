import { describe, expect, it } from 'vitest';
import {
  RESPONSE_VOICE_MODES,
  adaptResponseForVoiceMode,
  createBrowserSpeechProvider,
  isVoiceModeCompatibleWithInputMode,
} from './responseVoice';

describe('response voice modes', () => {
  it('preserves semantic facts across voice modes', () => {
    const raw = 'R4A passed. R4B passed. Promotion failed because of a syntax typo. Next action is to fix the function declaration.';
    const executive = adaptResponseForVoiceMode(raw, RESPONSE_VOICE_MODES.EXECUTIVE);
    const brief = adaptResponseForVoiceMode(raw, RESPONSE_VOICE_MODES.BRIEF);

    expect(executive).toContain('R4A');
    expect(executive).toContain('R4B');
    expect(executive).toContain('Promotion');
    expect(brief).toContain('syntax');
    expect(brief).toContain('fix');
  });

  it('brief retains the blocker and urgency', () => {
    const raw = 'R4A passed. Promotion is blocked by a syntax typo. Fix the declaration and rerun the chain.';
    const brief = adaptResponseForVoiceMode(raw, RESPONSE_VOICE_MODES.BRIEF);

    expect(brief).toContain('blocked');
    expect(brief).toContain('syntax');
    expect(brief).toContain('rerun');
  });

  it('technical mode preserves identifiers', () => {
    const raw = '20260816_004_r4b_promotion_boundaries.sql failed during function declaration.';
    const technical = adaptResponseForVoiceMode(raw, RESPONSE_VOICE_MODES.TECHNICAL);

    expect(technical).toContain('20260816_004_r4b_promotion_boundaries.sql');
    expect(technical).toContain('function declaration');
  });

  it('executive mode preserves uncertainty when it is present', () => {
    const raw = 'The evidence suggests this path is promising, but it is not proven yet.';
    const executive = adaptResponseForVoiceMode(raw, RESPONSE_VOICE_MODES.EXECUTIVE);

    expect(executive).toContain('evidence');
    expect(executive).toContain('not proven yet');
  });

  it('code blocks are not auto-read in full', () => {
    const raw = '```sql\nSELECT 1;\n```\nThe query was rejected by the migration guard.';
    const technical = adaptResponseForVoiceMode(raw, RESPONSE_VOICE_MODES.TECHNICAL);

    expect(technical).toContain('SQL block');
    expect(technical).not.toContain('SELECT 1;');
  });

  it('keeps input and voice mode independent', () => {
    expect(isVoiceModeCompatibleWithInputMode('TEXT', RESPONSE_VOICE_MODES.TECHNICAL)).toBe(true);
    expect(isVoiceModeCompatibleWithInputMode('SPEECH', RESPONSE_VOICE_MODES.BRIEF)).toBe(true);
    expect(isVoiceModeCompatibleWithInputMode('CONVERSATIONAL', RESPONSE_VOICE_MODES.OPERATOR)).toBe(true);
  });

  it('exposes a speech provider capable of stopping', () => {
    const provider = createBrowserSpeechProvider();
    expect(typeof provider.speak).toBe('function');
    expect(typeof provider.stop).toBe('function');
    expect(provider.health()).toMatch(/ready|unavailable/i);
  });
});
