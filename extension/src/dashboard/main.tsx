import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import Dashboard from './Dashboard';

const root = document.getElementById('root')!;
createRoot(root).render(<Dashboard />);
