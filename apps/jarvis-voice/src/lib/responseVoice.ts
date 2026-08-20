export const RESPONSE_VOICE_MODES = {
  STANDARD: 'STANDARD',
  EXECUTIVE: 'EXECUTIVE',
  TECHNICAL: 'TECHNICAL',
  BRIEF: 'BRIEF',
  CONVERSATIONAL: 'CONVERSATIONAL',
  OPERATOR: 'OPERATOR',
} as const;

export type ResponseVoiceMode = (typeof RESPONSE_VOICE_MODES)[keyof typeof RESPONSE_VOICE_MODES];
export type InputMode = 'TEXT' | 'SPEECH' | 'CONVERSATIONAL';

export type SpeechOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceName?: string;
  autoSpeak?: boolean;
  allowLongResponse?: boolean;
};

export type SpeechProvider = {
  speak: (text: string, options?: SpeechOptions) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  health: () => 'ready' | 'unavailable';
  listVoices: () => string[];
};

export type VoiceModeSettings = {
  mode: ResponseVoiceMode;
  rate: number;
  pauseMs: number;
  autoSpeak: boolean;
};

export function getVoiceModeSettings(mode: ResponseVoiceMode): VoiceModeSettings {
  const settings: Record<ResponseVoiceMode, VoiceModeSettings> = {
    STANDARD: { mode: 'STANDARD', rate: 1, pauseMs: 220, autoSpeak: false },
    EXECUTIVE: { mode: 'EXECUTIVE', rate: 1.06, pauseMs: 180, autoSpeak: true },
    TECHNICAL: { mode: 'TECHNICAL', rate: 0.92, pauseMs: 260, autoSpeak: false },
    BRIEF: { mode: 'BRIEF', rate: 1.12, pauseMs: 120, autoSpeak: true },
    CONVERSATIONAL: { mode: 'CONVERSATIONAL', rate: 1.04, pauseMs: 200, autoSpeak: true },
    OPERATOR: { mode: 'OPERATOR', rate: 0.96, pauseMs: 210, autoSpeak: true },
  };

  return settings[mode] ?? settings.STANDARD;
}

export function isVoiceModeCompatibleWithInputMode(inputMode: InputMode, voiceMode: ResponseVoiceMode): boolean {
  return inputMode === 'TEXT' ? true : inputMode === 'SPEECH' ? ['STANDARD', 'EXECUTIVE', 'BRIEF', 'OPERATOR', 'TECHNICAL', 'CONVERSATIONAL'].includes(voiceMode) : true;
}

function stripCodeFences(value: string): string {
  return value.replace(/```[\w-]*\n?/gi, '').replace(/\n?```/gi, '').trim();
}

function compressForBrief(text: string): string {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\b(Here is|Current state|The current state is|The blocker is|That gives us|Next move|Status)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned.length > 220 ? `${cleaned.slice(0, 210).trim()}…` : cleaned;
}

function technicalSpeakNormalization(text: string): string {
  return text
    .replace(/(?<![A-Za-z0-9_/.])RLS(?![A-Za-z0-9_])/gi, 'R L S')
    .replace(/(?<![A-Za-z0-9_/.])MCP(?![A-Za-z0-9_])/gi, 'M C P')
    .replace(/(?<![A-Za-z0-9_/.])SQL(?![A-Za-z0-9_])/gi, 'S Q L')
    .replace(/(?<![A-Za-z0-9_/.])UUID(?![A-Za-z0-9_])/gi, 'U U I D')
    .replace(/(?<![A-Za-z0-9_/.])API(?![A-Za-z0-9_])/gi, 'A P I')
    .replace(/(?<![A-Za-z0-9_/.])ATHRTY(?![A-Za-z0-9_])/gi, 'A T H R T Y')
    .replace(/(?<![A-Za-z0-9_/.])Supabase(?![A-Za-z0-9_])/gi, 'S U P A base')
    .replace(/(?<![A-Za-z0-9_/.])OpenJarvis(?![A-Za-z0-9_])/gi, 'Open Jarvis');
}

function serializeForSpeech(text: string, mode: ResponseVoiceMode): string {
  const codeBlockMatch = text.match(/```[\s\S]*?```/g);
  const withoutCode = codeBlockMatch ? text.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim() : stripCodeFences(text);
  if (!withoutCode) return text;

  if (mode === RESPONSE_VOICE_MODES.BRIEF) {
    return compressForBrief(withoutCode);
  }

  if (mode === RESPONSE_VOICE_MODES.TECHNICAL) {
    return technicalSpeakNormalization(withoutCode);
  }

  return withoutCode
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function adaptResponseForVoiceMode(rawText: string, mode: ResponseVoiceMode): string {
  const normalized = (rawText ?? '').trim();
  if (!normalized) return rawText;

  const base = serializeForSpeech(normalized, mode);

  switch (mode) {
    case RESPONSE_VOICE_MODES.STANDARD:
      return base;
    case RESPONSE_VOICE_MODES.EXECUTIVE:
      return `Status: ${base}. Next move: keep the blocker explicit and preserve the uncertainty.`;
    case RESPONSE_VOICE_MODES.TECHNICAL:
      if (normalized.includes('```')) {
        const prose = base ? `${base}. The SQL block is visible in the response.` : 'The SQL block is visible in the response.';
        return prose;
      }
      return base;
    case RESPONSE_VOICE_MODES.BRIEF:
      return base.length > 220 ? `${base.slice(0, 220).trim()}…` : base;
    case RESPONSE_VOICE_MODES.CONVERSATIONAL:
      return `Current state: ${base}.`;
    case RESPONSE_VOICE_MODES.OPERATOR:
      return `State: ${base}. Constraint: preserve the original blocker and evidence. Action: execute the next stated step without changing the facts.`;
    default:
      return base;
  }
}

export function createBrowserSpeechProvider(): SpeechProvider {
  const browserSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

  let currentUtterance: SpeechSynthesisUtterance | null = null;

  return {
    speak: async (text: string, options: SpeechOptions = {}) => {
      if (!browserSpeech) return;
      if (currentUtterance) {
        browserSpeech.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate ?? 1;
      utterance.pitch = options.pitch ?? 1;
      utterance.volume = options.volume ?? 1;
      const selectedVoiceName = options.voiceName?.trim();
      if (selectedVoiceName) {
        const voices = browserSpeech.getVoices();
        const match = voices.find((voice) => voice.name.toLowerCase().includes(selectedVoiceName.toLowerCase()));
        if (match) utterance.voice = match;
      }
      currentUtterance = utterance;
      browserSpeech.speak(utterance);
    },
    stop: () => {
      if (browserSpeech) browserSpeech.cancel();
      currentUtterance = null;
    },
    pause: () => {
      if (browserSpeech) browserSpeech.pause();
    },
    resume: () => {
      if (browserSpeech) browserSpeech.resume();
    },
    health: () => (browserSpeech ? 'ready' : 'unavailable'),
    listVoices: () => {
      if (!browserSpeech) return [];
      return browserSpeech.getVoices().map((voice) => voice.name);
    },
  };
}
