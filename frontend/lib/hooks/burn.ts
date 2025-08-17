// hooks/burnWithCDP.ts
import { ethers } from 'ethers';
import { getCurrentUser, isSignedIn, sendEvmTransaction } from '@coinbase/cdp-core';

import {
  BASE_SEPOLIA_TOKEN_MESSENGER_V2,
  POLYGON_AMOY_DOMAIN,
  BASE_SEPOLIA_USDC_CONTRACT_ADDRESS,
  BASE_SEPOLIA_RPC_URL,
} from '@/lib/constants';

// --- ABIs (minimal) ---
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
];

const TOKEN_MESSENGER_V2_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (bytes32 message)',
];

// --- Config ---
const BASE_SEPOLIA_CHAIN_ID = 84532; // decimal (0x14A34)

// helper: convert 5 -> 5_000_000 for USDC
const toAmount6 = (n: number) => ethers.parseUnits(n.toFixed(6), 6);

// helper: ABI encoders
const erc20Iface = new ethers.Interface(ERC20_ABI);
const messengerIface = new ethers.Interface(TOKEN_MESSENGER_V2_ABI);

export async function burnFromBase(params: {
  escrowContractAddress: `0x${string}`;
  amountUSDC: number;
  minFinality?: number; 
}) {
  const { escrowContractAddress, amountUSDC, minFinality = 2000 } = params;

  // 0) Require signed-in user (you should handle sign-in flow elsewhere)
  if (!(await isSignedIn())) {
    throw new Error('User not signed in to Embedded Wallet');
  }
  const user = await getCurrentUser();
  const evmAccount = user?.evmAccounts?.[0];
  if (!evmAccount) throw new Error('No EVM account in Embedded Wallet');

  // 1) Read state / estimate via public RPC
  const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
  const owner = evmAccount as `0x${string}`;
  const amount6 = toAmount6(amountUSDC);

  // on-chain reads with ethers (no signing)
  const usdc = new ethers.Contract(BASE_SEPOLIA_USDC_CONTRACT_ADDRESS, ERC20_ABI, provider);
  const balance: bigint = await usdc.balanceOf(owner);
  if (balance < amount6) throw new Error('Insufficient USDC on Base Sepolia');

  const allowance: bigint = await usdc.allowance(owner, BASE_SEPOLIA_TOKEN_MESSENGER_V2);

  // current fee data / nonce for both txs
  const [feeData, nonceNow] = await Promise.all([
    provider.getFeeData(),
    provider.getTransactionCount(owner, 'latest'),
  ]);
  const maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits('2', 'gwei');
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('1', 'gwei');

  // 2) If needed, send APPROVE via CDP
  let nextNonce = nonceNow;
  if (allowance < amount6) {
    const approveData = erc20Iface.encodeFunctionData('approve', [
      BASE_SEPOLIA_TOKEN_MESSENGER_V2,
      amount6,
    ]) as `0x${string}`;

    // estimate gas for approve
    const approveGas = await provider.estimateGas({
      from: owner,
      to: BASE_SEPOLIA_USDC_CONTRACT_ADDRESS,
      data: approveData,
    });

    const approveRes = await sendEvmTransaction({
      evmAccount,
      network: 'base-sepolia',
      transaction: {
        chainId: BASE_SEPOLIA_CHAIN_ID,
        type: 'eip1559',
        to: BASE_SEPOLIA_USDC_CONTRACT_ADDRESS as `0x${string}`,
        data: approveData,
        gas: approveGas + (approveGas / 10n), // +10% buffer
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce: Number(nextNonce),
        value: 0n,
      },
    });
    nextNonce += 1;

    await provider.waitForTransaction(approveRes.transactionHash)
  }

  // 3) Burn on TokenMessengerV2
  const mintRecipientBytes32 = ethers.zeroPadValue(escrowContractAddress, 32); // bytes32
  const destinationCaller = ethers.ZeroHash; // open finalize path
  const maxFee = 0n; // Standard Transfer => 0 in V2 today

  const burnData = messengerIface.encodeFunctionData('depositForBurn', [
    amount6,
    POLYGON_AMOY_DOMAIN,
    mintRecipientBytes32,
    BASE_SEPOLIA_USDC_CONTRACT_ADDRESS,
    destinationCaller,
    maxFee,
    minFinality,
  ]) as `0x${string}`;

  const burnGas = await provider.estimateGas({
    from: owner,
    to: BASE_SEPOLIA_TOKEN_MESSENGER_V2,
    data: burnData,
  });

  const burnRes = await sendEvmTransaction({
    evmAccount,
    network: 'base-sepolia',
    transaction: {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      type: 'eip1559',
      to: BASE_SEPOLIA_TOKEN_MESSENGER_V2 as `0x${string}`,
      data: burnData,
      gas: burnGas + (burnGas / 10n),
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce: Number(nextNonce),
      value: 0n,
    },
  });

  // Return the burn tx hash: your server will finalize on Amoy
  return { txHash: burnRes.transactionHash };
}
