import React from 'react';

export default function AgentStep({ step }: { step: any }) {
  return (
    <div style={{ padding: 6, borderBottom: '1px solid #fafafa' }}>
      <div style={{ fontWeight: 'bold' }}>{step.name}</div>
      <div>{step.status}</div>
    </div>
  );
}
