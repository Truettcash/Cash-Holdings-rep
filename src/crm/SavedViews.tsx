import React, { useState } from 'react';
import { useCRM } from './CRMContext';

export default function SavedViews() {
  const { savedViews, saveView, loadView, deleteView, filters, sorts, columns } = useCRM();
  const [name, setName] = useState('');

  const create = () => {
    if (!name) return;
    const id = String(Date.now());
    saveView({ id, name, filters, sorts, columns });
    setName('');
  };

  return (
    <div>
      <h4>Saved Views</h4>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={create}>Save</button>
      </div>
      <ul>
        {savedViews.map((v) => (
          <li key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => loadView(v.id)}>{v.name}</button>
            <button
              onClick={() => deleteView(v.id)}
              style={{ color: 'red' }}
              aria-label={`Delete view ${v.name}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
