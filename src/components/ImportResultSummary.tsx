import React from 'react';

export interface ImportResultSummaryProps {
  successCount?: number;
  failCount?: number;
}

export default function ImportResultSummary({
  successCount = 0,
  failCount = 0,
}: ImportResultSummaryProps) {
  const total = successCount + failCount;
  return (
    <div>
      <h3>Import Results</h3>
      <div>Total: {total}</div>
      <div>Success: {successCount}</div>
      <div>Failed: {failCount}</div>
    </div>
  );
}
