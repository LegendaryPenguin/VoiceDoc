"use client";

import { CDPReactProvider } from "@coinbase/cdp-react";

/**
 * Providers - Wraps app with Coinbase Developer Platform (CDP) provider
 * 
 * Inputs:
 * - children: React components to wrap with CDP context
 * 
 * Outputs:
 * - CDPReactProvider wrapper that enables embedded wallet functionality
 * 
 * This function configures the Coinbase embedded wallet with project ID
 * and app metadata (name, logo). The provider gives all child components
 * access to CDP hooks like useEvmAddress() and useSignEvmTransaction().
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  // Get CDP project ID from environment variables
  const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID as string;

  // Warn if project ID is missing (wallet won't work)
  if (!projectId) {
    console.error("Missing NEXT_PUBLIC_CDP_PROJECT_ID in .env.local");
  }

  return (
    <CDPReactProvider
      config={{ projectId }}
      app={{
        name: process.env.NEXT_PUBLIC_APP_NAME || "VoiceDoc",
        logoUrl: process.env.NEXT_PUBLIC_APP_LOGO_URL || "/logo.svg",
      }}
      theme={{}}
    >
      {children}
    </CDPReactProvider>
  );
}