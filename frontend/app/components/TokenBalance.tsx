// app/components/TokenBalance.tsx
'use client'

import { useEffect, useState } from 'react'
import { Address, createPublicClient, formatUnits, http } from 'viem'
import { base } from 'viem/chains'

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const

// Public Base RPC (fine for reads; rate-limited)
// If you have an RPC provider, drop its URL here.
const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

export default function TokenBalance({
  userAddress,
  tokenAddress, // ERC-20 contract address (e.g. USDC on Base)
}: {
  userAddress: Address
  tokenAddress: Address | 'ETH'
}) {
  const [display, setDisplay] = useState<string>('…')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (tokenAddress === 'ETH') {
          const wei = await client.getBalance({ address: userAddress })
          if (!cancelled) setDisplay(`${formatUnits(wei, 18)} ETH`)
          return
        }
        const [raw, decimals, symbol] = await Promise.all([
          client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [userAddress] }),
          client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
          client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
        ])
        if (!cancelled) setDisplay(`${formatUnits(raw as bigint, Number(decimals))} ${String(symbol)}`)
      } catch (e) {
        if (!cancelled) setDisplay('0')
      }
    })()
    return () => { cancelled = true }
  }, [userAddress, tokenAddress])

  return <span>{display}</span>
}
