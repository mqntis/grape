import React from 'react';
import Terminal from '../terminal/Terminal';

// The popup is a compact terminal; run `grape` to launch the mini TUI (to-do + status).
export default function Popup() {
  return <Terminal surface="popup" />;
}
