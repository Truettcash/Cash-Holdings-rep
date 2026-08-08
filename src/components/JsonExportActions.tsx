import React from 'react';

export interface JsonExportActionsProps {
  data: any;
  fileName?: string;
}

export default function JsonExportActions({
  data,
  fileName = 'export.json',
}: JsonExportActionsProps) {
  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <button onClick={download}>Export JSON</button>
    </div>
  );
}
