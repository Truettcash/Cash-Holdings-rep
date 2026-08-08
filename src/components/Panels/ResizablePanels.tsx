import React from 'react';

export default function ResizablePanels({ children }: { children: React.ReactNode }) {
  return <div className="resizable-panels">{children}</div>;
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="panel">{children}</div>;
}
