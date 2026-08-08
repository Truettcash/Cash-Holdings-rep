import React from 'react';

export default function MetricCard({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: '#666' }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}
