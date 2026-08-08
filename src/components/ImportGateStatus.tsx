import React from 'react';

export interface ImportGateStatusProps {
  status: 'idle' | 'running' | 'done' | 'error';
  message?: string;
}

export default function ImportGateStatus({ status, message }: ImportGateStatusProps) {
  const color =
    status === 'done'
      ? 'green'
      : status === 'error'
        ? 'red'
        : status === 'running'
          ? 'orange'
          : 'gray';
  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span style={{ width: 10, height: 10, borderRadius: 10, background: color }} />
      <strong>{status}</strong>
      {message ? <span style={{ opacity: 0.8 }}>{message}</span> : null}
    </div>
  );
}
