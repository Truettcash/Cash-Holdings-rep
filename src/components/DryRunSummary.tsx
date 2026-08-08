import React from 'react';

export interface DryRunSummaryProps {
  results?: any[];
}

export default function DryRunSummary({ results = [] }: DryRunSummaryProps) {
  return (
    <div>
      <h3>Dry Run Summary</h3>
      <div>Total rows: {results.length}</div>
    </div>
  );
}
