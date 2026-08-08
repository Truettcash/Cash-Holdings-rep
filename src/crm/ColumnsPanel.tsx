import React from 'react';
import { useCRM } from './CRMContext';

const DEFAULT_COLUMNS = ['name', 'email', 'phone', 'createdAt'];

export default function ColumnsPanel() {
  const { columns, setColumns } = useCRM();

  const toggle = (key: string) => {
    setColumns({ ...columns, [key]: !columns[key] });
  };

  return (
    <div>
      <h4>Columns</h4>
      <div style={{ display: 'flex', gap: 12 }}>
        {DEFAULT_COLUMNS.map((c) => (
          <label key={c} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={columns[c] ?? true} onChange={() => toggle(c)} />
            {c}
          </label>
        ))}
      </div>
    </div>
  );
}
