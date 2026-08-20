export type TranscriptionOptions = {
  locale?: string;
  timeoutMs?: number;
};

export interface TranscriptionProvider {
  transcribe(audio: Blob, options?: TranscriptionOptions): Promise<string>;
  health(): Promise<boolean>;
  capabilities(): {
    supportsStreaming: boolean;
    languages: string[];
    requiresAuth: boolean;
  };
}

export class DemoTranscriptionProvider implements TranscriptionProvider {
  async transcribe(audio: Blob, options?: TranscriptionOptions): Promise<string> {
    const name = audio.size > 0 ? 'captured-audio' : 'empty-audio';
    const locale = options?.locale ?? 'en-US';
    return `Demo transcription (${locale}) for ${name}`;
  }

  async health(): Promise<boolean> {
    return true;
  }

  capabilities() {
    return {
      supportsStreaming: false,
      languages: ['en-US'],
      requiresAuth: false,
    };
  }
}

export async function createTranscriptionProvider(): Promise<TranscriptionProvider> {
  return new DemoTranscriptionProvider();
}
