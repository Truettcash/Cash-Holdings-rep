import React, { useMemo } from 'react';
import { useIntegrationConnections } from '../hooks';
import IntegrationCard from './IntegrationCard';

export default function IntegrationGrid() {
  const { data: connections, isLoading, isError } = useIntegrationConnections();
  const items = useMemo(() => connections ?? [], [connections]);

  if (isLoading) return <div>Loading integrations…</div>;
  if (isError) return <div>Error loading integrations</div>;

  return (
    <div>
      <h2>Integrations</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {items.length === 0 ? (
          <div>No integration connections found.</div>
        ) : (
          items.map((c) => <IntegrationCard key={c.id} connection={c} />)
        )}
      </div>
    </div>
  );
}
