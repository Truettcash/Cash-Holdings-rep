import React from 'react';
import DataTable from '../../../components/data-table/DataTable';
import { ColumnDef } from '@tanstack/react-table';

type Lead = any;

const columns: ColumnDef<Lead, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'createdAt', header: 'Created' },
];

export default function CRMDataTable({ data = [] }: { data?: Lead[] }) {
  return <DataTable columns={columns} data={data} />;
}
