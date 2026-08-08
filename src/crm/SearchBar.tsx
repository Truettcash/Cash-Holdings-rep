import React from 'react';
import { useCRM } from './CRMContext';

export default function SearchBar() {
  const { query, setQuery } = useCRM();
  return (
    <div>
      <input
        aria-label="Global search"
        placeholder="Search leads..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ padding: 8, width: '100%' }}
      />
    </div>
  );
}
