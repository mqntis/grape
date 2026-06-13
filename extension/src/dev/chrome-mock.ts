/**
 * Minimal chrome API mock for browser preview.
 * Stores state in memory (resets on page reload) seeded from MockSource.
 */
import { MockSource } from '../adapters/MockSource.js';
import type { Assignment, RewardEvent, Multipliers } from '../engine/types.js';

interface Store {
  assignments: Assignment[];
  coinBalance: number;
  rewardEvents: RewardEvent[];
  multipliers: Multipliers;
}

const DEFAULT_MULTIPLIERS: Multipliers = {
  reading: 1.0, homework: 1.0, quiz: 1.0, essay: 1.0, project: 1.0, exam: 1.0,
};

let store: Store = {
  assignments: [],
  coinBalance: 0,
  rewardEvents: [],
  multipliers: DEFAULT_MULTIPLIERS,
};

// Seed mock data on load
new MockSource().fetchAssignments().then(assignments => {
  store = { ...store, assignments };
});

type MessageHandler = (response: unknown) => void;

function handleMessage(msg: Record<string, unknown>, sendResponse: MessageHandler) {
  if (msg['type'] === 'GET_STATE') {
    sendResponse({ ...store });
  } else if (msg['type'] === 'UPDATE_ASSIGNMENTS') {
    store = { ...store, assignments: msg['assignments'] as Assignment[] };
    sendResponse({ ok: true });
  } else if (msg['type'] === 'ADD_REWARD') {
    const event = msg['event'] as RewardEvent;
    store = {
      ...store,
      coinBalance: store.coinBalance + event.delta,
      rewardEvents: [...store.rewardEvents, event],
    };
    sendResponse({ ok: true, balance: store.coinBalance });
  }
}

// Install mock on window
(window as unknown as Record<string, unknown>)['chrome'] = {
  runtime: {
    sendMessage: (_msg: unknown, callback?: MessageHandler) => {
      // Run async so component lifecycle works the same as the real extension
      setTimeout(() => {
        if (callback) handleMessage(_msg as Record<string, unknown>, callback);
      }, 0);
    },
    openOptionsPage: () => {
      console.log('[chrome mock] openOptionsPage called');
    },
    lastError: null,
  },
  storage: {
    local: {
      get: (keys: string[], cb: (r: Partial<Store>) => void) => {
        const result: Partial<Store> = {};
        for (const k of keys) (result as Record<string, unknown>)[k] = (store as unknown as Record<string, unknown>)[k];
        setTimeout(() => cb(result), 0);
      },
      set: (data: Partial<Store>, cb?: () => void) => {
        store = { ...store, ...data };
        if (cb) setTimeout(cb, 0);
      },
    },
  },
};

export {};
