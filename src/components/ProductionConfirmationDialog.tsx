import React from 'react';

export interface ProductionConfirmationDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ProductionConfirmationDialog({
  open,
  onConfirm,
  onCancel,
}: ProductionConfirmationDialogProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'white',
          padding: 20,
          borderRadius: 6,
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
        }}
      >
        <h3>Confirm Production Import</h3>
        <p>Are you sure you want to import these leads into production?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
