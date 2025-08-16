"use client";

import { CDPReactProvider } from "@coinbase/cdp-react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID;

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
