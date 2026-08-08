import React, { useEffect } from 'react';
import { useCRM } from '../CRMContext';

export default function LostView() {
  const { setFilters } = useCRM();
  useEffect(() => {
    setFilters({ status: 'lost' });
  }, [setFilters]);
  return null;
}
