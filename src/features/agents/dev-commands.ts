import { features } from '../../config/features';

export function registerDevAgentCommands(
  getSelectedLead: () => any,
  openComposer: (p: any) => void
) {
  const enabled =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as any).env?.DEV) &&
    Boolean(features.devAgentRuntime);
  if (!enabled) return;

  // Expose a small set of dev commands on window for quick testing/automation.
  // These are intentionally simple and only available in dev mode.
  (window as any).__devAgentCommands = {
    askAgent: (prompt?: string) => openComposer({ mode: 'suggest', prompt: prompt ?? 'Help me' }),
    researchSelectedLead: () => {
      const lead = getSelectedLead();
      openComposer({
        mode: 'suggest',
        prompt: `Research ${lead?.name ?? 'selected lead'}`,
        context: { contactId: lead?.id },
      });
    },
    summarizeSelectedLead: () => {
      const lead = getSelectedLead();
      openComposer({
        mode: 'suggest',
        prompt: `Summarize ${lead?.name ?? 'selected lead'}`,
        context: { contactId: lead?.id },
      });
    },
    draftOutreachForSelectedLead: () => {
      const lead = getSelectedLead();
      openComposer({
        mode: 'draft',
        prompt: `Draft outreach for ${lead?.name ?? 'selected lead'}`,
        context: { contactId: lead?.id },
      });
    },
  };
}
