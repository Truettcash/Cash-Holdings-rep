import React from 'react';

export default function ApprovalCard({ approval }: { approval?: any }) {
  return (
    <div style={{ padding: 8, border: '1px solid #fee', borderRadius: 6 }}>
      <div>Approval requested: {approval?.id}</div>
      <div>Approved: {String(approval?.approved ?? false)}</div>
    </div>
  );
}
