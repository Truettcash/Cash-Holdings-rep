import React from 'react';
import { AGENT_MODES } from '../constants';
import { useAgentUI } from '../hooks';
import { features } from '../../../config/features';
import { isDevAgentAvailable } from '../dev-api';

export default function AgentComposer({ onSubmit }: { onSubmit?: (payload: any) => void }) {
  const [mode, setMode] = React.useState<string>(AGENT_MODES.SUGGEST);
  const [prompt, setPrompt] = React.useState('');
  const { composerPayload } = useAgentUI();

  React.useEffect(() => {
    if (composerPayload?.mode) setMode(composerPayload.mode);
    if (composerPayload?.prompt) setPrompt(composerPayload.prompt);
  }, [composerPayload]);

  const contextChips = composerPayload?.context
    ? Object.entries(composerPayload.context).map(([k, v]) => `${k}: ${v}`)
    : [];

  return (
    <div style={{ padding: 8 }}>
      <div style={{ marginBottom: 8 }}>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value={AGENT_MODES.SUGGEST}>Suggest</option>
          <option value={AGENT_MODES.DRAFT}>Draft</option>
          <option value={AGENT_MODES.EXECUTE_WITH_APPROVAL}>Execute (with approval)</option>
        </select>
      </div>
      <div style={{ marginBottom: 8 }}>
        {contextChips.map((c) => (
          <span
            key={c}
            style={{
              display: 'inline-block',
              marginRight: 6,
              padding: '4px 8px',
              background: '#f3f4f6',
              borderRadius: 6,
            }}
          >
            {c}
          </span>
        ))}
      </div>
      <textarea
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: '100%' }}
      />
      <div style={{ marginTop: 8 }}>
        <button
          disabled={prompt.trim().length === 0}
          onClick={() => onSubmit?.({ mode, prompt, context: composerPayload?.context })}
          style={{ marginRight: 8 }}
        >
          Run
        </button>
        <button
          onClick={() => {
            setPrompt('');
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
