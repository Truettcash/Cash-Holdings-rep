import { AgentContextSchema } from './schemas';

export type AgentContext = {
  route?: string;
  engagementId?: string;
  organizationId?: string;
  contactId?: string;
  brandKey?: string;
};

export function buildAgentContext(
  input: Partial<AgentContext>
): ReturnType<typeof AgentContextSchema.parse> {
  return AgentContextSchema.parse(input);
}
