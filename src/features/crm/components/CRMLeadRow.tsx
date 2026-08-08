import React from 'react';

export default function CRMLeadRow({
  lead,
  onSelect,
}: {
  lead: any;
  onSelect?: (id: string | number) => void;
}) {
  return (
    <tr onClick={() => onSelect?.(lead.id)} style={{ cursor: 'pointer' }}>
      <td>{lead.name}</td>
      <td>{lead.email}</td>
      <td>{lead.phone}</td>
      <td>{lead.createdAt}</td>
    </tr>
  );
}
