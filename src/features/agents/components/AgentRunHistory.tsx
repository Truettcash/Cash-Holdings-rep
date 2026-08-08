import React from 'react';

export default function AgentRunHistory({ runs }: { runs?: any[] }) {
  if (!runs || runs.length === 0) return <div style={{ padding: 12 }}>No runs yet</div>;
  return (
    <div>
      <ul>
        {runs.map((r) => (
          <li key={r.id} style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <strong>{r.definitionId}</strong>
            </div>
            <div>
              Status: {r.status} • Started: {r.createdAt}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
