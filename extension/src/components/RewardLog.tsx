import React from 'react';
import type { RewardEvent } from '../engine/types';

interface Props {
  events: RewardEvent[];
}

export default function RewardLog({ events }: Props) {
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {events.length === 0 && <p className="text-sm text-ink/40">No events yet</p>}
      {[...events].reverse().map((e, i) => (
        <div key={i} className={`p-2 rounded-lg text-xs flex items-start gap-2 ${e.delta > 0 ? 'bg-healthy/10' : 'bg-surface'}`}>
          <span className={`font-mono font-bold shrink-0 ${e.delta > 0 ? 'text-healthy' : 'text-ink/30'}`}>
            {e.delta > 0 ? `+${e.delta}` : e.delta < 0 ? `${e.delta}` : '±0'}
          </span>
          <div>
            <div className="font-semibold text-ink/80">{e.label}</div>
            <div className="text-ink/50">{e.reason}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
