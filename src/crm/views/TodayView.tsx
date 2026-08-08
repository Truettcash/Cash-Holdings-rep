import React, { useEffect } from 'react';
import { useCRM } from '../CRMContext';

export default function TodayView() {
  const { setFilters } = useCRM();
  useEffect(() => {
    setFilters({ status: 'contacted' });
  }, [setFilters]);
  return null;
}
