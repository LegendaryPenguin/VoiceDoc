"use client";

import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";
import { useEvmAddress, useIsSignedIn } from "@coinbase/cdp-hooks";
import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import BuyUSDCButton from "./BuyUSDCButton";

export default function HeaderAuth() {
  const isSignedIn = useIsSignedIn();

  // CDP hooks have had two return shapes across versions. Normalize:
  const raw = useEvmAddress() as any;
  const evmAddress: string | undefined =
    typeof raw === "string" ? raw : raw?.evmAddress;

  const shortAddr = useMemo(
    () =>
      evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : "",
    [evmAddress]
  );

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!evmAddress) return;
    await navigator.clipboard.writeText(evmAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-3">
      {isSignedIn && evmAddress && (
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            title={evmAddress}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:bg-gray-100"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{shortAddr}</span>
          </button>
        </div>
      )}
      {/* Buy USDC Button (Coinbase Onramp) */}
      {evmAddress && 
        <BuyUSDCButton
          fiatAmount="25.00"
          paymentCurrency="USD"
          network="base"   // or "base-sepolia" while testing
          asset="USDC"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-black hover:opacity-90"
        />
      }
      {/* AuthButton handles Sign in / Sign out automatically */}
      <AuthButton />
    </div>
  );
}
