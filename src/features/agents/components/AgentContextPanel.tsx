import React from 'react';

export default function AgentContextPanel({ context }: { context?: any }) {
  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontWeight: 'bold' }}>Context</div>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(context || {}, null, 2)}</pre>
    </div>
  );
}
