import React from 'react';

export interface Lead {
  id?: string | number;
  name?: string;
  email?: string;
  phone?: string;
}

export interface LeadPreviewTableProps {
  leads?: Lead[];
}

export default function LeadPreviewTable({ leads = [] }: LeadPreviewTableProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((l) => (
          <tr key={String(l.id ?? l.email ?? l.name)}>
            <td>{l.name}</td>
            <td>{l.email}</td>
            <td>{l.phone}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
