import React from 'react';

export default function AgentStatusBadge({ status }: { status?: string }) {
  return (
    <span style={{ padding: 6, background: '#eee', borderRadius: 6 }}>{status ?? 'idle'}</span>
  );
}
