// Canvas content script — runs on *.instructure.com
// Sends assignment data to service worker via chrome.runtime.sendMessage
import { CanvasSource } from '../adapters/CanvasSource.js';

(async () => {
  const src = new CanvasSource();
  if (!(await src.isAvailable())) return;
  try {
    const assignments = await src.fetchAssignments();
    chrome.runtime.sendMessage({ type: 'UPDATE_ASSIGNMENTS', assignments });
  } catch (e) {
    console.warn('[Cadence] Canvas sync failed:', e);
  }
})();
