import { z } from 'zod';

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

export const AgentToolCallSchema = z.object({
  toolKey: z.string(),
  input: z.any().optional(),
});

export const AgentToolResultSchema = z.object({
  toolKey: z.string(),
  output: z.any().optional(),
  success: z.boolean().optional(),
});

export const AgentApprovalSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string().optional(),
  requestedAt: z.string().optional(),
  approved: z.boolean().optional(),
});

export const AgentContextSchema = z.object({
  route: z.string().optional(),
  engagementId: z.string().optional(),
  organizationId: z.string().optional(),
  contactId: z.string().optional(),
  brandKey: z.string().optional(),
});

export const AgentErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});
