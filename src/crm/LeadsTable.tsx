import React, { useEffect, useMemo, useRef } from 'react';
import { useCRM } from './CRMContext';
import LeadDetailDrawer from '../components/LeadDetailDrawer';

export interface LeadRecord {
  id: string | number;
  name?: string;
  email?: string;
  phone?: string;
  fitScore?: number;
  queueScore?: number;
  createdAt?: string;
  tier?: string;
  brand?: string;
  status?: string;
  pipelineStage?: string;
}

export default function LeadsTable({ leads = [] as LeadRecord[] }: { leads?: LeadRecord[] }) {
  const { query, filters, sorts, columns, selectRow, selectedId } = useCRM();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => {
    return leads
      .filter((l) => {
        if (query) {
          const q = query.toLowerCase();
          if (!(
            String(l.name).toLowerCase().includes(q) ||
            String(l.email).toLowerCase().includes(q) ||
            String(l.phone).toLowerCase().includes(q)
          ))
            return false;
        }
        if (filters.tier && l.tier !== filters.tier) return false;
        if (filters.brand && l.brand !== filters.brand) return false;
        if (filters.status && l.status !== filters.status) return false;
        if (filters.pipelineStage && l.pipelineStage !== filters.pipelineStage) return false;
        if (filters.phoneReview && filters.phoneReview !== 'any') {
          const ok = filters.phoneReview === 'approved' ? true : false;
          // placeholder: assume phone present => approved
          if (!l.phone && ok) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sorts.fitScore)
          return sorts.fitScore === 'asc'
            ? (a.fitScore ?? 0) - (b.fitScore ?? 0)
            : (b.fitScore ?? 0) - (a.fitScore ?? 0);
        if (sorts.queueScore)
          return sorts.queueScore === 'asc'
            ? (a.queueScore ?? 0) - (b.queueScore ?? 0)
            : (b.queueScore ?? 0) - (a.queueScore ?? 0);
        return 0;
      });
  }, [leads, query, filters, sorts]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      const rows = Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr'));
      if (rows.length === 0) return;
      const active = document.activeElement as HTMLElement;
      const idx = rows.findIndex((r) => r === active);
      if (e.key === 'ArrowDown') {
        const next = rows[Math.min(rows.length - 1, Math.max(0, idx + 1))];
        (next as HTMLElement)?.focus();
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        const prev = rows[Math.max(0, Math.min(rows.length - 1, idx - 1))];
        (prev as HTMLElement)?.focus();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (active && active.dataset && active.dataset.id) selectRow(active.dataset.id);
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [containerRef, selectRow]);

  return (
    <div ref={containerRef} tabIndex={0} style={{ outline: 'none' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <tr>
            {columns['name'] !== false && <th style={{ textAlign: 'left' }}>Name</th>}
            {columns['email'] !== false && <th>Email</th>}
            {columns['phone'] !== false && <th>Phone</th>}
            {columns['createdAt'] !== false && <th>Created</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((l) => (
            <tr
              key={l.id}
              data-id={String(l.id)}
              tabIndex={0}
              onClick={() => selectRow(l.id)}
              style={{ background: selectedId === l.id ? '#f0f8ff' : undefined, cursor: 'pointer' }}
            >
              {columns['name'] !== false && <td>{l.name}</td>}
              {columns['email'] !== false && <td>{l.email}</td>}
              {columns['phone'] !== false && <td>{l.phone}</td>}
              {columns['createdAt'] !== false && <td>{l.createdAt}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <LeadDetailDrawer
        open={!!selectedId}
        lead={visible.find((x) => x.id === selectedId)}
        onClose={() => selectRow(undefined)}
      />
    </div>
  );
}
