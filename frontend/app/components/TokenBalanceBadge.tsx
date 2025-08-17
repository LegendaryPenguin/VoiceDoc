// app/components/TokenBalanceBadge.tsx
'use client'

import { useEffect, useState } from 'react'
import { useEvmAddress } from '@coinbase/cdp-hooks'
import { Address, createPublicClient, formatUnits, http } from 'viem'
import { base } from 'viem/chains'

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

export default function TokenBalanceBadge({
  tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, // USDC on Base
  label = 'USDC',
  decimalsOverride,
}: {
  tokenAddress?: Address
  label?: string
  decimalsOverride?: number
}) {
  const addr = useEvmAddress() as Address | undefined
  const [txt, setTxt] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!addr) { setTxt(''); return }
      try {
        const [raw, decimals] = await Promise.all([
          client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }) as Promise<bigint>,
          decimalsOverride ?? client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
        ])
        const pretty = Number(formatUnits(raw, Number(decimals))).toLocaleString(undefined, { maximumFractionDigits: 2 })
        if (!cancelled) setTxt(`${pretty} ${label}`)
      } catch {
        if (!cancelled) setTxt(`${0} ${label}`)
      }
    })()
    return () => { cancelled = true }
  }, [addr, tokenAddress, label, decimalsOverride])

  if (!addr || !txt) return null

  return (
    <span className="mr-3 inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">
      {txt}
    </span>
  )
}
