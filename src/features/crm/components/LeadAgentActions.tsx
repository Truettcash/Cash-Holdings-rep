import React from 'react';
import LeadQuickActions from './LeadQuickActions';

export default function LeadAgentActions({ lead }: { lead?: any }) {
  return (
    <div>
      <h4>AI Actions</h4>
      <LeadQuickActions lead={lead} />
    </div>
  );
}
