import React, { useEffect } from 'react';
import { useCRM } from '../CRMContext';

export default function WonView() {
  const { setFilters } = useCRM();
  useEffect(() => {
    setFilters({ status: 'won' });
  }, [setFilters]);
  return null;
}
