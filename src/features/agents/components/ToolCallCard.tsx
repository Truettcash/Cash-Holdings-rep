import React from 'react';

export default function ToolCallCard({ call }: { call?: any }) {
  return (
    <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
      <div style={{ fontWeight: 'bold' }}>{call?.toolKey}</div>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(call?.input, null, 2)}</pre>
    </div>
  );
}
