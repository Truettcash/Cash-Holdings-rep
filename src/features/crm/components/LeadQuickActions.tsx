import React from 'react';
import { useAgentUI } from '../../agents/hooks';
import { buildAgentContext } from '../../agents/context';

export default function LeadQuickActions({ lead }: { lead?: any }) {
  const { openComposer } = useAgentUI();

  const ctx = buildAgentContext({
    route: 'crm.lead',
    engagementId: lead?.id,
    organizationId: lead?.company,
    contactId: lead?.id,
    brandKey: lead?.brand,
  });

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={() =>
          openComposer({ mode: 'suggest', prompt: `Summarize ${lead?.name}`, context: ctx })
        }
      >
        Summarize
      </button>
      <button
        onClick={() =>
          openComposer({ mode: 'draft', prompt: `Draft outreach for ${lead?.name}`, context: ctx })
        }
      >
        Draft
      </button>
    </div>
  );
}
