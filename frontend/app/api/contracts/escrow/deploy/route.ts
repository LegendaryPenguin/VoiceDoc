export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { ABIJSON, CONTRACT_BYTECODE } from "@/lib/constants";

type CreateEscrowRequest = {
  agreement: {
    depositor_wallet_address: string;
    beneficiary_wallet_address: string;
  };
  amountUSDC: number; // e.g., 5 for 5 USDC (6 decimals)
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function getProvider() {
  const rpcUrl = requireEnv("RPC_URL");
  return new ethers.JsonRpcProvider(rpcUrl);
}

async function getSigner(provider: ethers.Provider) {
  const pk = requireEnv("DEPLOYER_PRIVATE_KEY");
  return new ethers.Wallet(pk, provider);
}

async function assertChain(provider: ethers.Provider) {
  const want = 80002;
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== want) {
    throw new Error(
      `Connected to chainId=${net.chainId}, expected CHAIN_ID=${want}`
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateEscrowRequest = await req.json();

    // Validate required fields
    const depositor = body?.agreement?.depositor_wallet_address;
    const beneficiary = body?.agreement?.beneficiary_wallet_address;
    const amountUSDC = body?.amountUSDC;

    if (!depositor || !beneficiary || amountUSDC == null) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (!ADDRESS_REGEX.test(depositor) || !ADDRESS_REGEX.test(beneficiary)) {
      return NextResponse.json(
        { error: "Invalid Ethereum address format" },
        { status: 400 }
      );
    }
    if (Number.isNaN(Number(amountUSDC)) || Number(amountUSDC) <= 0) {
      return NextResponse.json(
        { error: "amountUSDC must be a positive number" },
        { status: 400 }
      );
    }

    // Convert USDC (6 decimals) to contract units
    const contractAmount = ethers.parseUnits(String(amountUSDC), 6);

    // Provider & signer
    const provider = await getProvider();
    await assertChain(provider);
    const signer = await getSigner(provider);

    // Deploy
    const factory = new ethers.ContractFactory(
      ABIJSON as any,
      CONTRACT_BYTECODE as `0x${string}`,
      signer
    );

    const contract = await factory.deploy(
      depositor,
      beneficiary,
      contractAmount
    );

    // Wait for mining & get address/tx
    const deploymentTx = contract.deploymentTransaction();
    const txHash = deploymentTx?.hash ?? "0x";
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    return NextResponse.json(
      {
        success: true,
        status: "DEPLOYED",
        contractAddress,
        txHash,
        addresses: { depositor, beneficiary },
        amount: contractAmount.toString(),
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating escrow:", error);
    return NextResponse.json(
      {
        error: "Failed to deploy escrow contract",
        details: error?.reason || error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}