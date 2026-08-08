import React from 'react';
import { useCRM } from './CRMContext';

export default function FiltersPanel() {
  const { filters, setFilters, sorts, setSorts } = useCRM();

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={filters.tier ?? ''}
        onChange={(e) => setFilters({ ...filters, tier: e.target.value || null })}
      >
        <option value="">All Tiers</option>
        <option value="1">Tier 1</option>
        <option value="2">Tier 2</option>
      </select>

      <select
        value={filters.brand ?? ''}
        onChange={(e) => setFilters({ ...filters, brand: e.target.value || null })}
      >
        <option value="">All Brands</option>
        <option value="A">Brand A</option>
        <option value="B">Brand B</option>
      </select>

      <select
        value={filters.status ?? ''}
        onChange={(e) => setFilters({ ...filters, status: e.target.value || null })}
      >
        <option value="">All Statuses</option>
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
      </select>

      <select
        value={filters.pipelineStage ?? ''}
        onChange={(e) => setFilters({ ...filters, pipelineStage: e.target.value || null })}
      >
        <option value="">All Stages</option>
        <option value="prospect">Prospect</option>
        <option value="qualified">Qualified</option>
      </select>

      <select
        value={filters.phoneReview ?? 'any'}
        onChange={(e) => setFilters({ ...filters, phoneReview: (e.target.value as any) || null })}
      >
        <option value="any">Phone Review: Any</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Fit-score
        <select
          value={sorts.fitScore ?? ''}
          onChange={(e) => setSorts({ ...sorts, fitScore: (e.target.value as any) || null })}
        >
          <option value="">—</option>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Queue-score
        <select
          value={sorts.queueScore ?? ''}
          onChange={(e) => setSorts({ ...sorts, queueScore: (e.target.value as any) || null })}
        >
          <option value="">—</option>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </label>
    </div>
  );
}
