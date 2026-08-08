import React from 'react';

export default function AgentRunPanel({ run }: { run?: any }) {
  if (!run) return null;
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 'bold' }}>{run.definitionId ?? 'Agent Run'}</div>
      <div>Status: {run.status}</div>
      <div>Started: {run.createdAt}</div>
      <div style={{ marginTop: 8 }}>
        <strong>Steps</strong>
        <ul>
          {(run.steps || []).map((s: any) => (
            <li key={s.id}>
              {s.name} — {s.status ?? 'pending'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
