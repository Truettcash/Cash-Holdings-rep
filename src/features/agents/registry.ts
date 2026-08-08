import { AgentToolDefinitionSchema } from './types';
import { z } from 'zod';

export type ToolDef = z.infer<typeof AgentToolDefinitionSchema>;

export const agentToolRegistry: Record<string, ToolDef> = {
  'crm.get_lead': {
    key: 'crm.get_lead',
    name: 'Get Lead',
    description: 'Fetch a read-only lead record',
    category: 'crm',
    risk: 'read',
    requiresApproval: false,
    requiresOwner: false,
    enabled: true,
  },
  'crm.search_leads': {
    key: 'crm.search_leads',
    name: 'Search Leads',
    description: 'Search leads by query and filters',
    category: 'crm',
    risk: 'read',
    requiresApproval: false,
    requiresOwner: false,
    enabled: true,
  },
  'crm.summarize_lead': {
    key: 'crm.summarize_lead',
    name: 'Summarize Lead',
    description: 'Produce a human-readable summary of a lead',
    category: 'crm',
    risk: 'draft',
    requiresApproval: false,
    requiresOwner: false,
    enabled: true,
  },
  'crm.draft_outreach': {
    key: 'crm.draft_outreach',
    name: 'Draft Outreach',
    description: 'Draft outreach copy for a lead',
    category: 'communications',
    risk: 'draft',
    requiresApproval: false,
    requiresOwner: false,
    enabled: true,
  },
  // Future write tools (disabled)
  'crm.add_note': {
    key: 'crm.add_note',
    name: 'Add Note',
    description: 'Add a note to a lead',
    category: 'crm',
    risk: 'write',
    requiresApproval: true,
    requiresOwner: false,
    enabled: false,
  },
  'crm.schedule_follow_up': {
    key: 'crm.schedule_follow_up',
    name: 'Schedule Follow-Up',
    description: 'Schedule follow-up',
    category: 'crm',
    risk: 'write',
    requiresApproval: true,
    requiresOwner: false,
    enabled: false,
  },
  'communications.send_email': {
    key: 'communications.send_email',
    name: 'Send Email',
    description: 'Send an email',
    category: 'communications',
    risk: 'sensitive_write',
    requiresApproval: true,
    requiresOwner: false,
    enabled: false,
  },
};

export const agentDefinitions = {
  research_agent: {
    key: 'research_agent',
    name: 'Research Agent',
    description: 'Collects and summarizes public and CRM context for research',
    capabilities: [
      'crm.search_leads',
      'crm.get_lead',
      'crm.get_organization',
      'crm.get_contact',
      'crm.get_activity',
      'crm.summarize_lead',
      'crm.identify_missing_data',
    ],
    defaultMode: 'suggest',
    allowedModes: ['suggest', 'draft', 'execute_with_approval'],
  },
  sales_agent: {
    key: 'sales_agent',
    name: 'Sales Agent',
    description: 'Helps sales draft outreach and propose next actions',
    capabilities: [
      'crm.get_lead',
      'crm.get_organization',
      'crm.get_contact',
      'crm.get_activity',
      'crm.analyze_opportunity',
      'crm.propose_next_action',
      'crm.draft_outreach',
      'crm.draft_follow_up',
      'crm.draft_call_notes',
    ],
    defaultMode: 'draft',
    allowedModes: ['suggest', 'draft', 'execute_with_approval'],
  },
  crm_analyst: {
    key: 'crm_analyst',
    name: 'CRM Analyst',
    description: 'Performs pipeline analysis and identifies gaps',
    capabilities: [
      'crm.search_leads',
      'crm.summarize_pipeline',
      'crm.identify_stale_opportunities',
      'crm.identify_missing_data',
      'crm.analyze_fit_score',
      'crm.propose_next_action',
    ],
    defaultMode: 'suggest',
    allowedModes: ['suggest', 'draft', 'execute_with_approval'],
  },
  operations_analyst: {
    key: 'operations_analyst',
    name: 'Operations Analyst',
    description: 'Analyzes activity and operational metrics',
    capabilities: [
      'operations.summarize_activity',
      'operations.analyze_metrics',
      'operations.identify_anomalies',
      'crm.summarize_pipeline',
    ],
    defaultMode: 'suggest',
    allowedModes: ['suggest', 'draft', 'execute_with_approval'],
  },
};

export function getTool(key: string): ToolDef | undefined {
  return (agentToolRegistry as any)[key];
}

export function getAgentDefinition(key: string) {
  return (agentDefinitions as any)[key];
}
