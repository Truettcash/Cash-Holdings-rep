import React from 'react';
import { IntegrationConnection } from '../types';

const IntegrationCard: React.FC<{ connection: IntegrationConnection }> = ({ connection }) => {
  return (
    <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
      <div style={{ fontWeight: 600 }}>{connection.provider ?? 'Unknown provider'}</div>
      <div style={{ color: '#666' }}>Channel: {connection.channelId ?? 'unknown'}</div>
      <div style={{ marginTop: 8 }}>Status: {connection.connectionStatus ?? 'unknown'}</div>
      <div style={{ marginTop: 8 }}>Environment: {connection.environment ?? 'production'}</div>
    </div>
  );
};

export default IntegrationCard;
