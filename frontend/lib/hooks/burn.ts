// hooks/burn.ts (ethers v6, Option A - Standard/No-Fee)
import { ethers } from "ethers";
import {
  BASE_SEPOLIA_TOKEN_MESSENGER_V2,
  POLYGON_AMOY_DOMAIN,                     // should be 7
  BASE_SEPOLIA_USDC_CONTRACT_ADDRESS,
} from "../constants";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
    };
  }
}

export const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14A34"; // 84532

const TOKEN_MESSENGER_V2_ABI = [
  // v2 (we do NOT call getMinFeeAmount in Standard flow)
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (bytes32 message)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
];

// Safer float → 6dp conversion (prefer passing a string in production)
function toAmount6(n: number): bigint {
  const s = n.toFixed(6);                 // clamp to 6 dp
  return ethers.parseUnits(s, 6);
}

export async function burnFromBase({
  escrowContractAddress,
  amountUSDC,
}: {
  escrowContractAddress: `0x${string}`;
  amountUSDC: number; // e.g., 5 for 5 USDC
}) {
  if (!window.ethereum) throw new Error("Wallet not available");

  // --- 1) Ensure Base Sepolia
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (e: any) {
    if (e?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: BASE_SEPOLIA_CHAIN_ID_HEX,
          chainName: "Base Sepolia",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia.base.org"],
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        }],
      });
    } else {
      throw e;
    }
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();

  // --- 2) Instances & params
  const usdc = new ethers.Contract(
    BASE_SEPOLIA_USDC_CONTRACT_ADDRESS,
    ERC20_ABI,
    signer
  );
  const messenger = new ethers.Contract(
    BASE_SEPOLIA_TOKEN_MESSENGER_V2,
    TOKEN_MESSENGER_V2_ABI,
    signer
  );

  const amount6 = toAmount6(amountUSDC);
  const mintRecipient = ethers.zeroPadValue(escrowContractAddress, 32); // bytes32
  const destinationCaller = ethers.ZeroHash; // allow anyone to finalize
  const maxFee = BigInt(0);                         // Standard transfer => no USDC fee
  const minFinality = 2000;                  // Standard path

  // Optional: user-friendly precheck
  const bal = (await usdc.balanceOf(owner)) as bigint;
  if (bal < amount6) {
    throw new Error("Insufficient USDC balance on Base Sepolia");
  }

  // --- 3) Approve ONLY the amount (no fee needed in Standard)
  const allowance = (await usdc.allowance(owner, BASE_SEPOLIA_TOKEN_MESSENGER_V2)) as bigint;
  if (allowance < amount6) {
    // Safe pattern (zero then set) if you ever hit non-standard tokens:
    if (allowance > BigInt(0)) {
      await (await usdc.approve(BASE_SEPOLIA_TOKEN_MESSENGER_V2, BigInt(0))).wait();
    }
    await (await usdc.approve(BASE_SEPOLIA_TOKEN_MESSENGER_V2, amount6)).wait();
  }

  // --- 4) Burn (argument order is critical in v2)
  const tx = await messenger.depositForBurn(
    amount6,                               // 1) amount (6dp)
    POLYGON_AMOY_DOMAIN,                   // 2) destinationDomain (7)
    mintRecipient,                         // 3) bytes32(escrow on Amoy)
    BASE_SEPOLIA_USDC_CONTRACT_ADDRESS,    // 4) burnToken (Base Sepolia USDC)
    destinationCaller,                     // 5) bytes32(0) -> open finalize
    maxFee,                                // 6) 0 for Standard
    minFinality                            // 7) 2000
  );
  const receipt = await tx.wait();

  // Return hash so your server /api/cctp/finalize can complete on Amoy
  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}

