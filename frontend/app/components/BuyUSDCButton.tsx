// app/components/BuyUSDCButton.tsx
'use client';

import { useState, useCallback } from 'react';
// If you're already using CDP hooks:
import { useEvmAddress } from '@coinbase/cdp-hooks';

type Props = {
  fiatAmount?: string;       // e.g. "50.00"
  paymentCurrency?: string;  // e.g. "USD"
  network?: string;          // e.g. "base"
  asset?: string;            // e.g. "USDC"
  className?: string;
};

/**
 * BuyUSDCButton - Opens Coinbase Onramp to purchase crypto with fiat
 * 
 * Inputs:
 * - fiatAmount: how much fiat to spend (default "50.00")
 * - paymentCurrency: fiat currency code (default "USD")
 * - network: blockchain network (default "base")
 * - asset: crypto asset to buy (default "USDC")
 * - className: optional button styles
 * 
 * Outputs:
 * - Button that opens Coinbase Onramp popup for purchasing crypto
 * 
 * This function calls /api/onramp-url to generate a session URL, then opens
 * Coinbase's onramp flow in a popup window for the user to complete purchase.
 */
export default function BuyUSDCButton({
  fiatAmount = '50.00',
  paymentCurrency = 'USD',
  network = 'base',
  asset = 'USDC',
  className,
}: Props) {
  // Get user's wallet address from CDP hooks
  const { evmAddress } = useEvmAddress();
  const [loading, setLoading] = useState(false);

  // Handle button click: create onramp session and open popup
  const handleClick = useCallback(async () => {
    if (!evmAddress) {
      alert('Connect your wallet first.');
      return;
    }
    setLoading(true);
    try {
      // Call API to generate Coinbase Onramp URL
      const resp = await fetch('/api/onramp-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_address: evmAddress,
          network,
          asset,
          paymentAmount: fiatAmount,
          paymentCurrency,
        }),
      });
      if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          throw new Error(`Failed to create onramp session: ${t || resp.status}`);
        }
      const { onramp_url } = await resp.json();

      // Open Coinbase Onramp in a popup per their guidance (iframes not supported)
      // Width/height are suggestions; feel free to tweak
      window.open(
        onramp_url,
        'coinbase_onramp',
        'popup=yes,width=420,height=720,noopener,noreferrer'
      );
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [evmAddress, asset, fiatAmount, network, paymentCurrency]);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={className ?? 'px-4 py-2 rounded-lg bg-black text-white'}
    >
      {loading ? 'Preparing…' : `Buy ${asset} with ${paymentCurrency}`}
    </button>
  );
}