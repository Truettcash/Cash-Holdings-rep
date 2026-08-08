import React from 'react';

export interface FailureItem {
  row: number;
  error: string;
}

export interface ImportFailureTableProps {
  failures?: FailureItem[];
}

export default function ImportFailureTable({ failures = [] }: ImportFailureTableProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th>Row</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        {failures.map((f) => (
          <tr key={f.row}>
            <td>{f.row}</td>
            <td>{f.error}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
