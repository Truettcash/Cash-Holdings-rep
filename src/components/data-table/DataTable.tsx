import React from 'react';
import * as RT from '@tanstack/react-table';

type DataTableProps<T> = {
  columns: RT.ColumnDef<T, any>[];
  data: T[];
};

export default function DataTable<T>({ columns, data }: DataTableProps<T>) {
  // use a loose any-based table creation to avoid tight coupling
  // consumers should create the table instance with their preferred options
  const table: any = (RT as any).useReactTable
    ? (RT as any).useReactTable({ data, columns })
    : { getHeaderGroups: () => [], getRowModel: () => ({ rows: [] }) };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        {table.getHeaderGroups().map((hg: any) => (
          <tr key={hg.id}>
            {hg.headers.map((h: any) => (
              <th
                key={h.id}
                style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #eee' }}
              >
                {(RT as any).flexRender
                  ? (RT as any).flexRender(h.column.columnDef.header, h.getContext())
                  : h.column.columnDef.header}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row: any) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell: any) => (
              <td key={cell.id} style={{ padding: 8, borderBottom: '1px solid #fafafa' }}>
                {(RT as any).flexRender
                  ? (RT as any).flexRender(cell.column.columnDef.cell, cell.getContext())
                  : cell.column.columnDef.cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
