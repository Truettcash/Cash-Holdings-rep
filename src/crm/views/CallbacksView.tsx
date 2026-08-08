import React, { useEffect } from 'react';
import { useCRM } from '../CRMContext';

export default function CallbacksView() {
  const { setFilters } = useCRM();
  useEffect(() => {
    setFilters({ status: 'callback' });
  }, [setFilters]);
  return null;
}
