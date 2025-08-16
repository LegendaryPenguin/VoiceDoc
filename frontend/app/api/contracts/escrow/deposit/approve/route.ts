import { NextRequest, NextResponse } from "next/server";
import { circleContractSdk } from "@/lib/utils/smart-contract-platform-client";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";
import { convertUSDCToContractAmount } from "@/lib/utils/amount";

interface EscrowApproveRequest {
  circle_contract_id: string;
  beneficiary_wallet_id: string;
  depositor_wallet_id: string;
  amountUSDC: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: EscrowApproveRequest = await req.json();

    if (!body.circle_contract_id) {
      return NextResponse.json(
        { error: "Missing required circleContractId" },
        { status: 400 }
      );
    }

    // Retrieves contract data from Circle's SDK
    const contractData = await circleContractSdk.getContract({
      id: body.circle_contract_id
    });

    if (!contractData.data) {
      console.error("Could not retrieve contract data");
      return NextResponse.json({ error: "Could not retrieve contract data" }, { status: 500 });
    }

    const contractAddress = contractData.data?.contract.contractAddress;

    if (!contractAddress) {
      return NextResponse.json({ error: "Could not retrieve contract address" }, { status: 500 })
    }

    const contractAmount = Number(convertUSDCToContractAmount(body.amountUSDC))

    const circleApprovalResponse = await circleDeveloperSdk.createContractExecutionTransaction({
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [contractAddress, contractAmount],
      contractAddress: process.env.NEXT_PUBLIC_USDC_AMOY_CONTRACT_ADDRESS || "",
      fee: {
        type: "level",
        config: {
          feeLevel: "HIGH",
        }
      },
      walletId: body.depositor_wallet_id
    });

    console.log("Deposit approval transaction created:", circleApprovalResponse.data);

    return NextResponse.json(
      {
        success: true,
        transactionId: circleApprovalResponse.data?.id,
        status: circleApprovalResponse.data?.state,
        message: "Funds deposit approval initiated"
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error during deposit approval:", error);
    return NextResponse.json(
      {
        error: "Failed to initiate deposit approval",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
