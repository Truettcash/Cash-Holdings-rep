import React from 'react';

export default function IntegrationStatusBadge({ status }: { status: string }) {
  const color = status === 'connected' ? 'green' : status === 'not_connected' ? 'gray' : 'orange';
  return <span style={{ color }}>{status}</span>;
}
