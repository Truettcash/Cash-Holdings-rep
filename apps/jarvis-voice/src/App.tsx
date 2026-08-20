import { useEffect, useMemo, useRef, useState } from 'react';
import { askJarvisRuntime, type JarvisRuntimeResult } from './lib/runtimeBridge';
import { createJarvisPresentation, type PresentationModel } from './lib/presentation';
import {
  adaptResponseForVoiceMode,
  createBrowserSpeechProvider,
  getVoiceModeSettings,
  RESPONSE_VOICE_MODES,
  type ResponseVoiceMode,
} from './lib/responseVoice';
import { cleanupTranscript, createVoiceSession, routeVoiceMode, transitionVoiceState, type VoiceMode, type VoiceState } from './lib/voiceEngine';
import { createTranscriptionProvider } from './lib/transcription';

const starterPrompts = [
  'What projects are currently active?',
  'What do we know about ATHRTY CRM?',
  'What recurring pattern and likely constraint do we see in ATHRTY CRM?',
  'What intelligence are we tracking about ATHRTY CRM?',
];

type ActivityRow = {
  time: string;
  mode: 'JARVIS' | 'DICTATE';
  output: string;
  duration: string;
};

const toActivityMode = (value: VoiceMode): ActivityRow['mode'] => {
  return value === 'DICTATE' ? 'DICTATE' : 'JARVIS';
};

const defaultActivity: ActivityRow[] = [
  { time: '14:32', mode: 'JARVIS', output: 'What is blocking R4B.6H readiness?', duration: '08.4s' },
  { time: '14:28', mode: 'DICTATE', output: 'Update the promotion status summary.', duration: '14.1s' },
  { time: '14:17', mode: 'JARVIS', output: 'Run the regression checks again.', duration: '05.8s' },
];

const modeLabels: Record<VoiceMode, string> = {
  DICTATE: 'DICTATE',
  JARVIS: 'JARVIS',
};

function renderPresentationModel(model: PresentationModel) {
  if (model.kind === 'STATUS' && model.rows) {
    return (
      <div className="presentation-block status-block">
        <div className="block-label">STATUS</div>
        <div className="status-matrix">
          {model.rows.map((row) => (
            <div key={`${row.label}-${row.value}`} className="status-row">
              <span className="status-label">{row.label}</span>
              <span className={`status-pill ${String(row.value).toUpperCase()}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (model.kind === 'FLOW') {
    const steps = model.steps ?? [];
    if (steps.length === 0) {
      return (
        <div className="presentation-block text-block">
          <div className="block-label">FLOW</div>
          <p>{model.text ?? 'No flow steps available.'}</p>
        </div>
      );
    }

    return (
      <div className="presentation-block flow-block">
        <div className="block-label">FLOW</div>
        <div className="flow-diagram" aria-label="Jarvis flow diagram">
          {steps.map((step, index) => (
            <div key={`${step}-${index}`} className="flow-item-wrap">
              <div className="flow-item">{step}</div>
              {index < steps.length - 1 ? <span className="flow-arrow">↓</span> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (model.kind === 'METRIC' && model.metrics) {
    return (
      <div className="presentation-block metric-block">
        <div className="block-label">METRICS</div>
        <div className="metric-list">
          {model.metrics.map((metric) => {
            const value = Number.parseFloat(metric.value);
            const width = Number.isFinite(value) ? Math.min(100, Math.max(8, value * 100)) : 100;
            return (
              <div key={`${metric.label}-${metric.value}`} className="metric-row">
                <div className="metric-header">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
                <div className="metric-bar"><span style={{ width: `${width}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (model.kind === 'EVIDENCE' && model.sections) {
    return (
      <div className="presentation-block evidence-block">
        <div className="block-label">EVIDENCE</div>
        {model.sections.map((section) => (
          <div key={`${section.label}-${section.text}`} className="evidence-section">
            <div className="evidence-label">{section.label}</div>
            {section.text ? <div className="evidence-text">{section.text}</div> : null}
          </div>
        ))}
      </div>
    );
  }

  if (model.kind === 'CODE' && model.code) {
    return (
      <div className="presentation-block code-block">
        <div className="block-label">CODE</div>
        <pre>{model.code}</pre>
      </div>
    );
  }

  return (
    <div className="presentation-block text-block">
      <div className="block-label">TEXT</div>
      <p>{model.text ?? 'No structured output available.'}</p>
    </div>
  );
}

export function App() {
  const [mode, setMode] = useState<VoiceMode>('JARVIS');
  const [query, setQuery] = useState(starterPrompts[0]);
  const [voice, setVoice] = useState(() => createVoiceSession({ mode }));
  const [result, setResult] = useState<JarvisRuntimeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [activity, setActivity] = useState(defaultActivity);
  const [resultView, setResultView] = useState<'VISUAL' | 'RAW'>('VISUAL');
  const [voiceMode, setVoiceMode] = useState<ResponseVoiceMode>(RESPONSE_VOICE_MODES.OPERATOR);
  const [speechRate, setSpeechRate] = useState(1);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const speechProviderRef = useRef(createBrowserSpeechProvider());

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const currentQueryRef = useRef(query);

  useEffect(() => {
    currentQueryRef.current = query;
  }, [query]);

  useEffect(() => {
    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === 'audioinput');
      setMicrophones(audioInputs);
      if (audioInputs[0] && !selectedMic) setSelectedMic(audioInputs[0].deviceId);
    };

    void loadDevices();
  }, [selectedMic]);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.altKey && event.code === 'Space')) return;
      event.preventDefault();
      if (recording) return;
      await startCapture();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!(event.altKey && event.code === 'Space')) return;
      event.preventDefault();
      stopCapture();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && recording) {
        event.preventDefault();
        cancelCapture();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [recording, selectedMic]);

  const startCapture = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone unavailable in this browser session.');
      setVoice((previous) => transitionVoiceState(previous, 'ERROR', { reason: 'Microphone unavailable' }));
      return;
    }

    setError(null);
    setVoice((previous) => transitionVoiceState({ ...previous, mode }, 'LISTENING'));
    setRecording(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedMic ? { exact: selectedMic } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) {
          setVoice((previous) => transitionVoiceState(previous, 'ERROR', { reason: 'No speech detected' }));
          setRecording(false);
          return;
        }

        try {
          setVoice((previous) => transitionVoiceState(previous, 'TRANSCRIBING'));
          const provider = await createTranscriptionProvider();
          const text = await provider.transcribe(blob, { locale: 'en-US' });
          const cleaned = cleanupTranscript(text);
          setVoice((previous) => ({ ...previous, rawTranscript: text, transcript: cleaned, state: 'CLEANING' }));
          const routed = routeVoiceMode(mode, cleaned);

          if (mode === 'DICTATE') {
            const textOnly = routed.cleaned || 'Ready';
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(textOnly);
            }
            setResult({ ok: true, action: 'dictate', intent: 'DICTATE', status: 'ready', answer: textOnly, transcript: [textOnly] });
            setVoice((previous) => transitionVoiceState({ ...previous, transcript: cleaned }, 'COMPLETE'));
            setActivity((entries) => [{ time: 'now', mode: toActivityMode('DICTATE'), output: cleaned, duration: '00:05' }, ...entries].slice(0, 5));
            return;
          }

          setVoice((previous) => transitionVoiceState({ ...previous, transcript: cleaned }, 'SENDING_TO_JARVIS'));
          const jarvisResult = await askJarvisRuntime(cleaned || currentQueryRef.current);
          setResult(jarvisResult);
          setVoice((previous) => transitionVoiceState({ ...previous, transcript: cleaned }, jarvisResult.ok === false ? 'ERROR' : 'COMPLETE'));
          if (jarvisResult.ok === false) setError(jarvisResult.error ?? 'Jarvis request failed.');
          setActivity((entries) => [{ time: 'now', mode: toActivityMode('JARVIS'), output: cleaned, duration: '00:08' }, ...entries].slice(0, 5));
        } catch (catchError) {
          const message = catchError instanceof Error ? catchError.message : 'Transcription failed.';
          setError(message);
          setVoice((previous) => transitionVoiceState(previous, 'ERROR', { reason: message }));
        } finally {
          setRecording(false);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
        }
      };

      recorderRef.current = recorder;
      recorder.start();
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : 'Microphone access failed.';
      setError(message);
      setVoice((previous) => transitionVoiceState(previous, 'ERROR', { reason: message }));
      setRecording(false);
    }
  };

  const stopCapture = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const cancelCapture = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setVoice((previous) => transitionVoiceState(previous, 'ERROR', { reason: 'Cancelled' }));
    setError('Cancelled');
    setRecording(false);
  };

  const statusText = useMemo(() => {
    if (voice.state === 'LISTENING') return 'LISTENING';
    if (voice.state === 'TRANSCRIBING') return 'TRANSCRIBING';
    if (voice.state === 'CLEANING') return 'CLEANING';
    if (voice.state === 'SENDING_TO_JARVIS') return 'SENDING';
    if (voice.state === 'COMPLETE') return 'READY';
    if (voice.state === 'ERROR') return 'ERROR';
    return 'READY';
  }, [voice.state]);

  const presentation = useMemo(() => createJarvisPresentation(result?.answer ?? query), [query, result?.answer]);
  const spokenSummary = useMemo(
    () => (result?.answer ? adaptResponseForVoiceMode(result.answer, voiceMode) : adaptResponseForVoiceMode(query, voiceMode)),
    [query, result?.answer, voiceMode]
  );

  useEffect(() => {
    const settings = getVoiceModeSettings(voiceMode);
    setSpeechRate(settings.rate);
  }, [voiceMode]);

  const speakCurrentResponse = async () => {
    const text = spokenSummary || (result?.answer ?? query);
    if (!text) return;
    await speechProviderRef.current.speak(text, {
      rate: speechRate,
      autoSpeak,
      volume: 1,
    });
  };

  const stopSpeaking = () => {
    speechProviderRef.current.stop();
  };

  return (
    <div className="jarvis-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">J</div>
          <div>
            <p className="eyebrow">TRUETT CASH</p>
            <h1>Jarvis Voice</h1>
          </div>
        </div>

        <nav className="nav">
          <button type="button" className="nav-item active">Activity</button>
          <button type="button" className="nav-item">Dictionary</button>
          <button type="button" className="nav-item">Snippets</button>
          <button type="button" className="nav-item">Styles</button>
        </nav>

        <div className="sidebar-divider" />

        <div className="settings-group">
          <p className="mini-label">AUDIO</p>
          <label className="field-row">
            <span>Microphone</span>
            <select value={selectedMic} onChange={(event) => setSelectedMic(event.target.value)}>
              {microphones.length === 0 ? <option value="">System default</option> : null}
              {microphones.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as VoiceMode)}>
              {Object.entries(modeLabels).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow muted">Primary Workspace</p>
            <div className="workspace-title-row">
              <strong>{mode}</strong>
              <span className="divider-dot" />
              <span>{statusText}</span>
            </div>
          </div>
          <div className="header-actions">
            <button type="button" className="secondary-action">Open Tray</button>
            <button type="button" className="secondary-action">Quiet Mode</button>
          </div>
        </header>

        <section className="voice-panel">
          <div className="voice-bar" data-state={voice.state}>
            <div className="voice-handle">
              <span className="voice-mark">J</span>
              <span className="name">JARVIS</span>
            </div>

            <div className="waveform" aria-label="audio level indicator">
              {[0.25, 0.65, 0.4, 0.8, 0.55, 0.35, 0.7, 0.45, 0.6, 0.32].map((level, index) => (
                <span key={index} className="wave-segment" style={{ height: `${Math.max(18, level * 62)}px` }} />
              ))}
            </div>

            <div className="voice-meta">
              <span>{statusText}</span>
              <span className="timestamp">00:08</span>
            </div>

            <button type="button" className="cancel-button" onClick={cancelCapture}>×</button>
          </div>

          <div className="mode-switch">
            <button type="button" className={mode === 'DICTATE' ? 'mode-button active' : 'mode-button'} onClick={() => setMode('DICTATE')}>DICTATE</button>
            <button type="button" className={mode === 'JARVIS' ? 'mode-button active' : 'mode-button'} onClick={() => setMode('JARVIS')}>JARVIS</button>
          </div>

          <div className="voice-controls">
            <div className="voice-control-row">
              <label htmlFor="voice-mode-select">MODE</label>
              <select id="voice-mode-select" value={voiceMode} onChange={(event) => setVoiceMode(event.target.value as ResponseVoiceMode)}>
                {Object.values(RESPONSE_VOICE_MODES).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <div className="voice-control-row compact-row">
              <label htmlFor="speech-rate">RATE</label>
              <input id="speech-rate" type="range" min="0.7" max="1.4" step="0.05" value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} />
              <span>{speechRate.toFixed(2)}x</span>
            </div>
            <div className="voice-toggle-row">
              <label>
                <input type="checkbox" checked={autoSpeak} onChange={(event) => setAutoSpeak(event.target.checked)} />
                AUTO-SPEAK
              </label>
              <button type="button" className="secondary-action" onClick={speakCurrentResponse}>SPEAK</button>
              <button type="button" className="secondary-action" onClick={stopSpeaking}>STOP</button>
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <div className="activity-panel">
            <div className="panel-header">
              <h2>Activity</h2>
              <button type="button" className="small-action">Live</button>
            </div>

            <table className="activity-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Mode</th>
                  <th>Output</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((entry) => (
                  <tr key={`${entry.time}-${entry.output}`}>
                    <td>{entry.time}</td>
                    <td>{entry.mode}</td>
                    <td>{entry.output}</td>
                    <td>{entry.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="inspector-panel">
            <div className="panel-header">
              <h2>Result</h2>
              <button type="button" className="small-action">Clipboard</button>
            </div>

            <div className="result-box">
              {error ? <p className="error-text">{error}</p> : null}
              {!error && result ? (
                <>
                  <div className="result-toolbar">
                    <button type="button" className={resultView === 'VISUAL' ? 'toggle-button active' : 'toggle-button'} onClick={() => setResultView('VISUAL')}>VISUAL</button>
                    <button type="button" className={resultView === 'RAW' ? 'toggle-button active' : 'toggle-button'} onClick={() => setResultView('RAW')}>RAW</button>
                  </div>
                  <p className="result-title">{result.status ?? 'Ready'}</p>
                  {resultView === 'RAW' ? (
                    <pre className="raw-output">{result.answer ?? 'No output produced.'}</pre>
                  ) : (
                    renderPresentationModel(presentation.model)
                  )}
                </>
              ) : !error ? (
                <>
                  <div className="result-toolbar">
                    <button type="button" className="toggle-button active" disabled>VISUAL</button>
                    <button type="button" className="toggle-button" disabled>RAW</button>
                  </div>
                  <p>Ready for the next capture.</p>
                </>
              ) : null}
            </div>

            <div className="input-box">
              <label htmlFor="jarvis-query">Prompt</label>
              <textarea id="jarvis-query" value={query} onChange={(event) => setQuery(event.target.value)} rows={5} />
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
