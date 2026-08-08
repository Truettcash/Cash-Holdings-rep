import React from 'react';

export default function ToolResultCard({ result }: { result?: any }) {
  return (
    <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
      <div style={{ fontWeight: 'bold' }}>{result?.toolKey}</div>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result?.output, null, 2)}</pre>
    </div>
  );
}
