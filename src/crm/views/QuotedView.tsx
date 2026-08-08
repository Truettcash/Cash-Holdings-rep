import React, { useEffect } from 'react';
import { useCRM } from '../CRMContext';

export default function QuotedView() {
  const { setFilters } = useCRM();
  useEffect(() => {
    setFilters({ status: 'quoted' });
  }, [setFilters]);
  return null;
}
