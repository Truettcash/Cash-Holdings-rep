import React from 'react';
import AgentComposer from './AgentComposer';
import AgentEmptyState from './AgentEmptyState';
import { useAgentUI } from '../hooks';
import { isDevAgentAvailable } from '../dev-api';

export default function AgentDock() {
  const { dockOpen, setDockOpen, composerPayload, clearComposer } = useAgentUI();
  const showDevIndicator = isDevAgentAvailable();

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        width: dockOpen ? 420 : 64,
        transition: 'width 180ms',
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 8, display: 'flex', justifyContent: 'space-between' }}>
          <strong>Agent</strong>
          {showDevIndicator ? (
            <div
              style={{
                fontSize: 11,
                color: '#9b1c1c',
                marginLeft: 8,
                padding: '2px 6px',
                background: '#fff1f2',
                borderRadius: 6,
              }}
            >
              SIMULATED
            </div>
          ) : null}
          <button onClick={() => setDockOpen(!dockOpen)}>{dockOpen ? '−' : '+'}</button>
        </div>
        {dockOpen ? (
          <div>
            <AgentComposer
              onSubmit={(p) => {
                console.log('agent submit', p);
                clearComposer();
              }}
            />
            <AgentEmptyState />
          </div>
        ) : (
          <div style={{ padding: 12 }}>Ask</div>
        )}
      </div>
    </div>
  );
}
