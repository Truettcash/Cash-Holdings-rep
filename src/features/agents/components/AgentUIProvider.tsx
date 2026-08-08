import React from 'react';

type ComposerPayload = { mode?: string; prompt?: string; context?: Record<string, any> };

export const AgentUIContext = React.createContext<{
  dockOpen: boolean;
  setDockOpen: (v: boolean) => void;
  composerPayload?: ComposerPayload;
  openComposer: (p: ComposerPayload) => void;
  clearComposer: () => void;
} | null>(null);

export function AgentUIProvider({ children }: { children: React.ReactNode }) {
  const [dockOpen, setDockOpen] = React.useState(false);
  const [composerPayload, setComposerPayload] = React.useState<ComposerPayload | undefined>(
    undefined
  );

  const openComposer = (p: ComposerPayload) => {
    setComposerPayload(p);
    setDockOpen(true);
  };

  const clearComposer = () => setComposerPayload(undefined);

  return (
    <AgentUIContext.Provider
      value={{ dockOpen, setDockOpen, composerPayload, openComposer, clearComposer }}
    >
      {children}
    </AgentUIContext.Provider>
  );
}
