import React from 'react';
import { useCRM } from '../../../crm/CRMContext';

export default function CRMTableToolbar() {
  const { query, setQuery, savedViews } = useCRM();

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
      <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select>
        <option>All tiers</option>
      </select>
      <div style={{ marginLeft: 'auto' }}>{savedViews.length} saved views</div>
    </div>
  );
}
