import React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';

function Fallback({ error }: { error: Error | null }) {
  return (
    <div style={{ padding: 16 }}>
      <h2>Something went wrong</h2>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{String(error?.message ?? '')}</pre>
    </div>
  );
}

export default function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return <ReactErrorBoundary FallbackComponent={Fallback}>{children}</ReactErrorBoundary>;
}
