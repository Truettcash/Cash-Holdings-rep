import React from 'react';

export default function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ padding: '4px 8px', background: '#eee', borderRadius: 999 }}>{children}</span>
  );
}
