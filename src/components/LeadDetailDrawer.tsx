import React from 'react';
import { useAgentUI } from '../features/agents/hooks';
import { buildAgentContext } from '../features/agents/context';

export interface LeadDetailDrawerProps {
  lead?: any;
  open?: boolean;
  onClose?: () => void;
}

export default function LeadDetailDrawer({ lead, open, onClose }: LeadDetailDrawerProps) {
  if (!open) return null;
  const { openComposer } = useAgentUI();
  const ctx = buildAgentContext({
    route: 'crm.lead',
    engagementId: lead?.id,
    organizationId: lead?.company,
    contactId: lead?.id,
    brandKey: lead?.brand,
  });

  return (
    <aside
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 360,
        background: '#fff',
        boxShadow: '-6px 0 24px rgba(0,0,0,0.12)',
        padding: 16,
      }}
    >
      <button onClick={onClose} style={{ float: 'right' }}>
        Close
      </button>
      <h3>Lead Details</h3>
      <div style={{ marginBottom: 12 }}>
        <strong>AI Actions</strong>
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() =>
              openComposer({
                mode: 'suggest',
                prompt: `Summarize lead ${lead?.name}`,
                context: ctx,
              })
            }
            style={{ marginRight: 8 }}
          >
            Summarize
          </button>
          <button
            onClick={() =>
              openComposer({ mode: 'suggest', prompt: `Research ${lead?.name}`, context: ctx })
            }
            style={{ marginRight: 8 }}
          >
            Research
          </button>
          <button
            onClick={() =>
              openComposer({
                mode: 'draft',
                prompt: `Draft outreach for ${lead?.name}`,
                context: ctx,
              })
            }
            style={{ marginRight: 8 }}
          >
            Draft Outreach
          </button>
          <button
            onClick={() =>
              openComposer({
                mode: 'suggest',
                prompt: `Suggest next action for ${lead?.name}`,
                context: ctx,
              })
            }
          >
            Next Action
          </button>
        </div>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(lead ?? {}, null, 2)}</pre>
    </aside>
  );
}
