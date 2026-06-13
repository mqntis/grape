// Must be first — installs window.chrome before any component renders
import './chrome-mock.js';

import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import Dashboard from '../dashboard/Dashboard.js';

createRoot(document.getElementById('root')!).render(<Dashboard />);
