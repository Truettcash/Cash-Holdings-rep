export const VOICE_STATES = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  TRANSCRIBING: 'TRANSCRIBING',
  CLEANING: 'CLEANING',
  SENDING_TO_JARVIS: 'SENDING_TO_JARVIS',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR',
} as const;

export const VOICE_MODES = {
  DICTATE: 'DICTATE',
  JARVIS: 'JARVIS',
} as const;

export const INPUT_MODES = {
  TEXT: 'TEXT',
  SPEECH: 'SPEECH',
  CONVERSATIONAL: 'CONVERSATIONAL',
} as const;

export type VoiceState = (typeof VOICE_STATES)[keyof typeof VOICE_STATES];
export type VoiceMode = (typeof VOICE_MODES)[keyof typeof VOICE_MODES];
export type InputMode = (typeof INPUT_MODES)[keyof typeof INPUT_MODES];

export type InputState =
  | 'TEXT_IDLE'
  | 'TEXT_EDITING'
  | 'TEXT_SUBMITTING'
  | 'TEXT_COMPLETE'
  | 'TEXT_ERROR'
  | 'SPEECH_IDLE'
  | 'SPEECH_LISTENING'
  | 'SPEECH_TRANSCRIBING'
  | 'SPEECH_CLEANING'
  | 'SPEECH_REVIEW'
  | 'SPEECH_SUBMITTING'
  | 'SPEECH_COMPLETE'
  | 'SPEECH_ERROR'
  | 'CONVERSATION_INACTIVE'
  | 'CONVERSATION_STARTING'
  | 'CONVERSATION_LISTENING'
  | 'CONVERSATION_TRANSCRIBING'
  | 'CONVERSATION_PROCESSING'
  | 'CONVERSATION_RESPONDING'
  | 'CONVERSATION_READY_NEXT_TURN'
  | 'CONVERSATION_ENDING'
  | 'CONVERSATION_ERROR';

export type VoiceSession = {
  state: VoiceState;
  mode: VoiceMode;
  elapsedMs: number;
  maxDurationMs: number;
  error: string | null;
  transcript: string;
  rawTranscript: string;
  hotkeyPressed: boolean;
};

export type InputSession = {
  inputMode: InputMode;
  actionMode: VoiceMode;
  state: InputState;
  transcript: string;
  rawTranscript: string;
  conversationActive: boolean;
  conversationContext: string[];
  sessionId: string;
  continueSession: boolean;
  silenceTimeoutMs: number;
  sessionTimeoutMs: number;
};

export type HotkeyState = {
  key: string;
  mode: 'push-to-talk' | 'toggle';
  pressed: boolean;
};

export function createVoiceSession(overrides: Partial<VoiceSession> = {}): VoiceSession {
  return {
    state: VOICE_STATES.IDLE,
    mode: VOICE_MODES.JARVIS,
    elapsedMs: 0,
    maxDurationMs: 12000,
    error: null,
    transcript: '',
    rawTranscript: '',
    hotkeyPressed: false,
    ...overrides,
  };
}

export function createInputSession(overrides: Partial<InputSession> = {}): InputSession {
  return {
    inputMode: INPUT_MODES.TEXT,
    actionMode: VOICE_MODES.JARVIS,
    state: 'TEXT_IDLE',
    transcript: '',
    rawTranscript: '',
    conversationActive: false,
    conversationContext: [],
    sessionId: `session-${Date.now()}`,
    continueSession: true,
    silenceTimeoutMs: 5000,
    sessionTimeoutMs: 120000,
    ...overrides,
  };
}

export function transitionVoiceState(session: VoiceSession, nextState: VoiceState, options: { reason?: string } = {}): VoiceSession {
  return {
    ...session,
    state: nextState,
    error: options.reason ?? session.error,
  };
}

export function transitionInputState(session: InputSession, nextState: InputState, options: { reason?: string } = {}): InputSession {
  return {
    ...session,
    state: nextState,
    error: options.reason ? options.reason : undefined,
  } as InputSession;
}

export function routeVoiceMode(mode: VoiceMode, transcript: string) {
  const cleaned = cleanupTranscript(transcript);
  return {
    route: mode,
    cleaned,
    target: mode === VOICE_MODES.JARVIS ? 'runtimeBridge' : 'focused-field-or-clipboard',
  };
}

export function routeTextInput(text: string) {
  const cleaned = cleanupTranscript(text);
  return {
    mode: INPUT_MODES.TEXT,
    cleaned,
    submitted: Boolean(cleaned),
    route: 'typed_prompt',
  };
}

export function routeSpeechInput(transcript: string) {
  const cleaned = cleanupTranscript(transcript);
  return {
    mode: INPUT_MODES.SPEECH,
    cleaned,
    submitted: Boolean(cleaned),
    route: 'push_to_talk',
  };
}

export function startConversationSession(session: InputSession): InputSession {
  const context = session.conversationContext.length > 0 ? [...session.conversationContext] : [];
  return {
    ...session,
    conversationActive: true,
    state: 'CONVERSATION_STARTING',
    conversationContext: context,
    sessionId: session.sessionId || `session-${Date.now()}`,
  };
}

export function endConversationSession(session: InputSession): InputSession {
  return {
    ...session,
    conversationActive: false,
    state: 'CONVERSATION_ENDING',
    transcript: '',
    rawTranscript: '',
  };
}

export function newConversationSession(session: InputSession): InputSession {
  return {
    ...session,
    conversationActive: false,
    state: 'CONVERSATION_INACTIVE',
    conversationContext: [],
    sessionId: `session-${Date.now()}`,
  };
}

export function appendConversationContext(session: InputSession, transcript: string): InputSession {
  const cleaned = cleanupTranscript(transcript);
  if (!cleaned) return session;
  return {
    ...session,
    conversationContext: [...session.conversationContext, cleaned].slice(-8),
    transcript: cleaned,
    rawTranscript: transcript,
    state: 'CONVERSATION_READY_NEXT_TURN',
  };
}

export function createHotkeyState(options: Partial<HotkeyState> & { key: string }): HotkeyState {
  return {
    key: options.key,
    mode: options.mode ?? 'push-to-talk',
    pressed: false,
  };
}

function normalizeSentenceStart(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) return trimmed;

  const commandLikePattern = /^(?:git|npm|pnpm|bun|yarn|node|npx|deno|python|python3|pip|poetry|uv|pytest|vitest|tsc|cargo|docker|kubectl|curl|wget|ssh|scp|rsync|ls|cd|cat|grep|find|sed|awk|jq|psql|sqlite3|make|rm|mv|cp|chmod|echo|printf|openssl|ffmpeg|supabase)\b/i;

  if (commandLikePattern.test(trimmed)) {
    return trimmed;
  }

  const firstChar = trimmed.charAt(0);
  if (firstChar >= 'a' && firstChar <= 'z') {
    return firstChar.toUpperCase() + trimmed.slice(1);
  }

  return trimmed;
}

export function cleanupTranscript(input: string): string {
  const withoutFiller = input
    .replace(/\b(uh|um|ah|like|you know)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const withoutEllipses = withoutFiller.replace(/\.{2,}/g, '.');
  const sentences = withoutEllipses
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(normalizeSentenceStart);

  const final = sentences.join(' ');
  return final.replace(/\s+\./g, '.').replace(/\s+,/g, ',').replace(/\s+:/g, ':');
}

export function evaluateSpeechActivity(levels: Array<{ level: number }>): boolean {
  if (levels.length === 0) return false;
  const peak = Math.max(...levels.map((entry) => Number(entry.level ?? 0)));
  return peak > 0.15;
}
