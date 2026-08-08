import React from 'react';

export default function AgentRunHeader({ title }: { title?: string }) {
  return (
    <div style={{ padding: 8, borderBottom: '1px solid #eee' }}>
      <h4>{title ?? 'Agent Run'}</h4>
    </div>
  );
}
