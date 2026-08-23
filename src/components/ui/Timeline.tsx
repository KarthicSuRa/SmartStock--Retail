'use client';

// /src/components/ui/Timeline.tsx
// SmartStock Experience V1 — Operational Audit & Event Timeline

import React from 'react';

export interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  description?: string;
  status?: 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
  actor?: string;
}

export interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ events, className = '' }) => {
  const dotColors = {
    healthy: 'bg-[#039855] ring-4 ring-[#EDFDF5]',
    warning: 'bg-[#DC6803] ring-4 ring-[#FEF6EE]',
    critical: 'bg-[#D92D20] ring-4 ring-[#FEF3F2]',
    info: 'bg-[#1570EF] ring-4 ring-[#EFF8FF]',
    neutral: 'bg-[#667085] ring-4 ring-[#F2F4F7]',
  };

  return (
    <div className={`relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-[#E4E7EC] ${className}`}>
      {events.map((event) => {
        const dot = dotColors[event.status || 'neutral'];

        return (
          <div key={event.id} className="relative group">
            {/* Timeline Dot */}
            <div className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full ${dot}`} />

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-[#667085]">{event.time}</span>
                <span className="text-xs font-semibold text-[#101828]">{event.title}</span>
                {event.actor && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#F2F4F7] text-[#475467]">
                    {event.actor}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="text-xs text-[#475467] leading-relaxed pl-0.5">{event.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
