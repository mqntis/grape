import { CalendarSource } from '../adapters/CalendarSource.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'SCRAPE_CALENDAR_TASKS') return;

  const src = new CalendarSource();
  src.fetchAssignments()
    .then(assignments => sendResponse({ ok: true, assignments }))
    .catch(err => {
      console.warn('[Grape] Calendar scrape failed:', err);
      sendResponse({ ok: false, error: String(err) });
    });

  return true;
});
