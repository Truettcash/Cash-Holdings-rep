import React from 'react';
import { registerDevAgentCommands } from './dev-commands';
import { useCRM } from '../../crm/CRMContext';
import { useAgentUI } from './hooks';

export default function RegisterDevCommands() {
  const crm = (() => {
    try {
      // useCRM may throw if CRMProvider isn't mounted — that's acceptable
      // we lazily call it inside try/catch to avoid breaking the app.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useCRM();
    } catch (e) {
      return null;
    }
  })();

  const { openComposer } = useAgentUI();

  React.useEffect(() => {
    registerDevAgentCommands(() => {
      const sel = crm?.selectedId;
      if (!sel) return undefined;
      // In dev commands we only expose id and name placeholder
      return { id: sel, name: `lead-${sel}` };
    }, openComposer);
  }, [crm?.selectedId, openComposer]);

  return null;
}
