import React from 'react';

export interface PhoneReviewPanelProps {
  phone?: string;
  onApprove?: () => void;
  onReject?: () => void;
}

export default function PhoneReviewPanel({ phone, onApprove, onReject }: PhoneReviewPanelProps) {
  return (
    <div>
      <h3>Phone Review</h3>
      <div>{phone ?? 'No phone provided'}</div>
      <div style={{ marginTop: 8 }}>
        <button onClick={onApprove}>Approve</button>
        <button onClick={onReject} style={{ marginLeft: 8 }}>
          Reject
        </button>
      </div>
    </div>
  );
}
