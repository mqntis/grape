import React from 'react';
import Terminal from '../terminal/Terminal';

// The dashboard is now a full-screen terminal (grapeOS). All features are commands;
// `grape` launches the interactive TUI.
export default function Dashboard() {
  return <Terminal surface="dashboard" />;
}
