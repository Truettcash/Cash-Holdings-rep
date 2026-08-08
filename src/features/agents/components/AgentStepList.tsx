import React from 'react';

export default function AgentStepList({ steps }: { steps?: any[] }) {
  return (
    <ol>
      {(steps || []).map((s) => (
        <li key={s.id}>
          {s.name} — {s.status}
        </li>
      ))}
    </ol>
  );
}
