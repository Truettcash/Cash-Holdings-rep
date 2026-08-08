import React from 'react';
import { useCRM } from '../../../crm/CRMContext';

export default function CRMFilters() {
  const { filters, setFilters } = useCRM();
  return (
    <div style={{ padding: 8 }}>
      <div>
        <label>Tier:</label>
        <input
          value={filters.tier ?? ''}
          onChange={(e) => setFilters({ ...filters, tier: e.target.value || undefined })}
        />
      </div>
      <div>
        <label>Brand:</label>
        <input
          value={filters.brand ?? ''}
          onChange={(e) => setFilters({ ...filters, brand: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
