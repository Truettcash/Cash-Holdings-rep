import React, { useEffect } from 'react';
import { useCRM } from '../CRMContext';

export default function ResearchNeededView() {
  const { setFilters } = useCRM();
  useEffect(() => {
    setFilters({ status: 'research_needed' });
  }, [setFilters]);
  return null;
}
