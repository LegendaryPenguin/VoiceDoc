'use client';

import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import HeaderAuth from './HeaderAuth';

interface AppShellProps {
  children: React.ReactNode;
  /** Renders immediately to the LEFT of the wallet/auth UI */
  leftOfWallet?: React.ReactNode; // NEW
}

/**
 * AppShell - Main layout wrapper with sidebar and top bar
 * 
 * Inputs:
 * - children: main page content to render
 * - leftOfWallet: optional component to display left of auth (e.g. balance pill)
 * 
 * Outputs:
 * - Full page layout with collapsible sidebar, top navigation bar, and content area
 * 
 * This function provides the core app structure: sidebar for navigation,
 * top bar with hamburger menu + auth controls, and scrollable main content.
 */
export default function AppShell({ children, leftOfWallet }: AppShellProps) {
  // Track sidebar open/closed state for mobile menu
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar component - opens/closes via sidebarOpen state */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          {/* Left side: menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Open sidebar"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Right side: [leftOfWallet] [Wallet/Auth] */}
          <div className="flex items-center gap-2">
            {leftOfWallet /* <— your balance pill goes here */}
            <HeaderAuth />
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}