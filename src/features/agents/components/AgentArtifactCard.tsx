import React from 'react';

export default function AgentArtifactCard({ artifact }: { artifact?: any }) {
  return (
    <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
      <div style={{ fontWeight: 'bold' }}>{artifact?.title ?? artifact?.type}</div>
      <div style={{ fontSize: 12, color: '#666' }}>
        {artifact?.type} • {artifact?.createdAt}
      </div>
      <div style={{ marginTop: 8 }}>
        <pre style={{ whiteSpace: 'pre-wrap' }}>
          {artifact?.content ?? JSON.stringify(artifact?.payload ?? {}, null, 2)}
        </pre>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(String(artifact?.content ?? ''));
          }}
        >
          Copy
        </button>
        <button onClick={() => alert('Use as Draft — not implemented')}>Use as Draft</button>
        <button onClick={() => alert('Open — not implemented')}>Open</button>
      </div>
    </div>
  );
}
