import { MockSource } from '../adapters/MockSource.js';

chrome.runtime.onInstalled.addListener(async () => {
  const mock = new MockSource();
  const assignments = await mock.fetchAssignments();
  await chrome.storage.local.set({ assignments, coinBalance: 0, rewardEvents: [], multipliers: {
    reading: 1.0, homework: 1.0, quiz: 1.0, essay: 1.0, project: 1.0, exam: 1.0,
  }});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(['assignments', 'coinBalance', 'rewardEvents', 'multipliers'])
      .then(sendResponse);
    return true;
  }
  if (msg.type === 'UPDATE_ASSIGNMENTS') {
    chrome.storage.local.set({ assignments: msg.assignments }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'ADD_REWARD') {
    chrome.storage.local.get(['coinBalance', 'rewardEvents']).then(store => {
      const balance = (store['coinBalance'] as number ?? 0) + msg.event.delta;
      const events = [...(store['rewardEvents'] as unknown[] ?? []), msg.event];
      chrome.storage.local.set({ coinBalance: balance, rewardEvents: events })
        .then(() => sendResponse({ ok: true, balance }));
    });
    return true;
  }
});
