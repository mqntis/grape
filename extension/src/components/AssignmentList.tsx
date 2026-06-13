// AssignmentList — inline in Dashboard.tsx; stub exported here for future extraction
import React from 'react';
import type { Assignment } from '../engine/types';

interface Props {
  assignments: Assignment[];
  onMarkDone: (id: string, daysEarly: number) => void;
}

export default function AssignmentList({ assignments, onMarkDone }: Props) {
  return (
    <div className="space-y-2">
      {assignments.map(a => (
        <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{a.title}</div>
            <div className="text-xs text-ink/50 font-mono">
              {a.type} · due +{a.dueInDays}d · {a.calEst}h est
            </div>
          </div>
          <button
            onClick={() => onMarkDone(a.id, a.dueInDays - 1)}
            className="text-xs bg-accent/10 text-accent px-2 py-1 rounded-md hover:bg-accent/20 shrink-0"
          >
            Done
          </button>
        </div>
      ))}
    </div>
  );
}
