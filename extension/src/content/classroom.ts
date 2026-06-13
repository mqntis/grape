// Google Classroom content script — DOM scrape
import { ClassroomSource } from '../adapters/ClassroomSource.js';

(async () => {
  const src = new ClassroomSource();
  if (!(await src.isAvailable())) return;
  try {
    const assignments = await src.fetchAssignments();
    if (assignments.length > 0) {
      chrome.runtime.sendMessage({ type: 'UPDATE_ASSIGNMENTS', assignments });
    }
  } catch (e) {
    console.warn('[Grape] Classroom sync failed:', e);
  }
})();
