import React from 'react';

export interface CheckItem {
  name: string;
  ok: boolean;
  message?: string;
}

export interface ValidationChecksProps {
  checks?: CheckItem[];
}

export default function ValidationChecks({ checks = [] }: ValidationChecksProps) {
  return (
    <div>
      <h3>Validation</h3>
      <ul>
        {checks.map((c, i) => (
          <li key={i}>
            {c.ok ? '✅' : '❌'} {c.name} {c.message ? `— ${c.message}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
