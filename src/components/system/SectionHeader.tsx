import React from 'react';

export default function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ marginTop: 16, marginBottom: 8 }}>
      <h3>{title}</h3>
    </div>
  );
}
