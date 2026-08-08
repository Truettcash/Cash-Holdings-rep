import { z } from 'zod';
import { LeadPreviewSchema } from '../website-outbound/schemas';

export const AgentToolDefinitionSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  risk: z.enum(['read', 'draft', 'write', 'sensitive_write']).default('read'),
  requiresApproval: z.boolean().optional().default(false),
  requiresOwner: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
  inputSchema: z.any().optional(),
  outputSchema: z.any().optional(),
});

export const AgentStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});

export const AgentArtifactSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.any(),
});

export const AgentRunSchema = z.object({
  id: z.string(),
  definitionId: z.string().optional(),
  mode: z.string(),
  status: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  steps: z.array(AgentStepSchema).optional(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        toolKey: z.string(),
        input: z.any().optional(),
        risk: z.string().optional(),
      })
    )
    .optional(),
  approvals: z
    .array(
      z.object({
        id: z.string(),
        runId: z.string(),
        toolCallId: z.string().optional(),
        status: z.string().optional(),
        requestedAt: z.string().optional(),
        decidedAt: z.string().optional(),
        decidedBy: z.string().optional(),
      })
    )
    .optional(),
  artifacts: z.array(AgentArtifactSchema).optional(),
  error: z.any().optional(),
});

export type AgentToolDefinition = z.infer<typeof AgentToolDefinitionSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentArtifact = z.infer<typeof AgentArtifactSchema>;
