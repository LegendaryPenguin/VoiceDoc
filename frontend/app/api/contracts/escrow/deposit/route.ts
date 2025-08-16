import { NextRequest, NextResponse } from "next/server";
import { circleContractSdk } from "@/lib/utils/smart-contract-platform-client";
import { circleDeveloperSdk } from "@/lib/utils/developer-controlled-wallets-client";

interface EscrowDepositRequest {
  circle_contract_id: string;
  beneficiary_wallet_id: string;
  depositor_wallet_id: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: EscrowDepositRequest = await req.json();

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

    const circleDepositResponse = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: body.depositor_wallet_id,
      contractAddress,
      abiFunctionSignature: "deposit()",
      abiParameters: [],
      fee: {
        type: "level",
        config: {
          feeLevel: "MEDIUM",
        },
      },
    });

    console.log("Funds deposit transaction created:", circleDepositResponse.data);

    return NextResponse.json(
      {
        success: true,
        transactionId: circleDepositResponse.data?.id,
        status: circleDepositResponse.data?.state,
        message: "Funds deposit transaction initiated"
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error during funds deposit initialization:", error);
    return NextResponse.json(
      {
        error: "Failed to initiate funds deposit",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
