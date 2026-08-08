import React from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);

  useHotkeys('ctrl+k,cmd+k', () => setOpen((v) => !v));

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)}>Open Command Palette</button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 20,
            background: 'white',
            border: '1px solid #eee',
            padding: 8,
            borderRadius: 6,
          }}
        >
          <input placeholder="Type a command..." aria-label="command-input" />
        </div>
      ) : null}
    </div>
  );
}
