import { describe, expect, it } from 'vitest';
import {
  INPUT_MODES,
  appendConversationContext,
  createInputSession,
  endConversationSession,
  newConversationSession,
  routeSpeechInput,
  routeTextInput,
  startConversationSession,
} from './voiceEngine';

describe('input mode handling', () => {
  it('routes typed input correctly', () => {
    const result = routeTextInput('Analyze ATHRTY.');
    expect(result.mode).toBe(INPUT_MODES.TEXT);
    expect(result.cleaned).toContain('Analyze');
    expect(result.submitted).toBe(true);
  });

  it('routes spoken transcript correctly', () => {
    const result = routeSpeechInput('What pattern are we seeing?');
    expect(result.mode).toBe(INPUT_MODES.SPEECH);
    expect(result.cleaned).toContain('What');
  });

  it('retains conversation context across turns', () => {
    let session = createInputSession({ inputMode: INPUT_MODES.CONVERSATIONAL, conversationActive: true });
    session = appendConversationContext(session, 'What is blocking R4B.6H?');
    session = appendConversationContext(session, 'What should we fix next?');
    expect(session.conversationContext).toHaveLength(2);
    expect(session.conversationActive).toBe(true);
  });

  it('ends conversation cleanly', () => {
    const session = endConversationSession(
      createInputSession({ inputMode: INPUT_MODES.CONVERSATIONAL, conversationActive: true, state: 'CONVERSATION_LISTENING' })
    );
    expect(session.conversationActive).toBe(false);
    expect(session.state).toBe('CONVERSATION_ENDING');
  });

  it('starts a new conversation session explicitly', () => {
    const session = newConversationSession(createInputSession({ inputMode: INPUT_MODES.CONVERSATIONAL, conversationActive: true }));
    expect(session.conversationActive).toBe(false);
    expect(session.conversationContext).toEqual([]);
  });

  it('keeps text input technical and format-preserving', () => {
    const result = routeTextInput('  git status --short\n node src/app.ts  ');
    expect(result.cleaned).toContain('git status --short');
    expect(result.cleaned).toContain('node src/app.ts');
  });

  it('switches into conversation state without corruption', () => {
    const session = startConversationSession(createInputSession({ inputMode: INPUT_MODES.CONVERSATIONAL }));
    expect(session.conversationActive).toBe(true);
    expect(session.state).toBe('CONVERSATION_STARTING');
  });
});
