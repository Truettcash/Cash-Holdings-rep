import React from 'react';

export interface TimelineEvent {
  id?: string | number;
  date: string;
  text: string;
}

export interface EngagementTimelineProps {
  events?: TimelineEvent[];
}

export default function EngagementTimeline({ events = [] }: EngagementTimelineProps) {
  return (
    <div>
      <h3>Engagement Timeline</h3>
      <ul>
        {events.map((e) => (
          <li key={String(e.id ?? e.date)}>
            <strong>{e.date}</strong>: {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
