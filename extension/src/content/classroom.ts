import { ClassroomSource } from '../adapters/ClassroomSource.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'SCRAPE_CLASSROOM_TODO') return;

  const src = new ClassroomSource();
  src.fetchAssignments()
    .then(assignments => sendResponse({ ok: true, assignments }))
    .catch(err => {
      console.warn('[Grape] Classroom scrape failed:', err);
      sendResponse({ ok: false, error: String(err) });
    });

  return true;
});
