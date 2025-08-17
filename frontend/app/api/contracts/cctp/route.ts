export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { BASE_SEPOLIA_DOMAIN, POLYGON_AMOY_MESSAGE_TRANSMITTER_V2, POLYGON_AMOY_RPC_URL } from "@/lib/constants";


// --- Minimal ABI
const MT_ABI = [
  "function receiveMessage(bytes message, bytes attestation) external returns (bool)",
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/**
 * Iris v2 poller: fetch { message, attestation } by source domain + tx hash.
 * - Returns once attestation is available.
 * - Polls up to ~20 minutes by default (Standard finality).
 */
async function fetchMessageAndAttestationV2(opts: {
  sourceDomainId: number;
  txHash: `0x${string}`;
  expectMintRecipient?: `0x${string}`; // sanity check (optional)
  irisBase?: string;
  maxAttempts?: number;  // default 600
  intervalMs?: number;   // default 2000 ms
}) {
  const {
    sourceDomainId,
    txHash,
    expectMintRecipient,
    irisBase = process.env.IRIS_BASE_URL ?? "https://iris-api-sandbox.circle.com",
    maxAttempts = 600,  // ~20 minutes @ 2s
    intervalMs = 2000,
  } = opts;

  const url = `${irisBase}/v2/messages/${sourceDomainId}?transactionHash=${txHash}`;

  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      await new Promise((res) => setTimeout(res, intervalMs));
      continue;
    }

    const data = await r.json() as {
      messages?: Array<{
        message: `0x${string}`;
        attestation: `0x${string}` | "PENDING";
        status?: "complete" | "pending_confirmations";
        cctpVersion?: "1" | "2";
        decodedMessageBody?: { mintRecipient?: string; amount?: string };
      }>;
    };

    const msgs = data.messages || [];
    if (msgs.length === 0) {
      await new Promise((res) => setTimeout(res, intervalMs));
      continue;
    }

    // If you know who should receive the mint, prefer that message
    const normalizedRecipient = expectMintRecipient?.toLowerCase();
    const candidates = normalizedRecipient
      ? msgs.filter(m => m.decodedMessageBody?.mintRecipient?.toLowerCase() === normalizedRecipient)
      : msgs;

    // Prefer v2 & complete
    const sorted = (candidates.length ? candidates : msgs).sort((a, b) => {
      const av = a.cctpVersion === "2" ? 1 : 0;
      const bv = b.cctpVersion === "2" ? 1 : 0;
      if (av !== bv) return bv - av;
      const ac = a.status === "complete" ? 1 : 0;
      const bc = b.status === "complete" ? 1 : 0;
      return bc - ac;
    });

    const m = sorted[0];
    if (!m) {
      await new Promise((res) => setTimeout(res, intervalMs));
      continue;
    }

    if (m.attestation === "PENDING" || m.status === "pending_confirmations") {
      await new Promise((res) => setTimeout(res, intervalMs));
      continue;
    }

    // Ready
    return {
      message: m.message as `0x${string}`,
      attestation: m.attestation as `0x${string}`,
      decoded: m.decodedMessageBody,
    };
  }

  throw new Error("Iris v2 message/attestation not ready (timeout).");
}

export async function POST(req: NextRequest) {
  try {
    const { txHash, expectedMintRecipient } = await req.json();

    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: "Valid txHash is required" }, { status: 400 });
    }
    if (expectedMintRecipient && !/^0x[0-9a-fA-F]{40}$/.test(expectedMintRecipient)) {
      return NextResponse.json({ error: "Invalid expectedMintRecipient" }, { status: 400 });
    }

    // 1) Fetch message + attestation from Iris v2 (Base Sepolia domain=6)
    const { message, attestation, decoded } = await fetchMessageAndAttestationV2({
      sourceDomainId: BASE_SEPOLIA_DOMAIN,
      txHash,
      expectMintRecipient: expectedMintRecipient as `0x${string}` | undefined,
    });

    // 2) Call receiveMessage on Polygon Amoy
    const amoyProvider = new ethers.JsonRpcProvider(POLYGON_AMOY_RPC_URL);
    const signer = new ethers.Wallet(requireEnv("AMOY_DEPLOYER_PRIVATE_KEY"), amoyProvider);
    const transmitter = new ethers.Contract(
      POLYGON_AMOY_MESSAGE_TRANSMITTER_V2,
      MT_ABI,
      signer
    );

    let mintTxHash = "";
    try {
      const mintTx = await transmitter.receiveMessage(message, attestation);
      mintTxHash = mintTx.hash;
      await mintTx.wait();
    } catch (e: any) {
      const msg = e?.reason || e?.message || "";
      // If someone else (a relayer) already processed it, treat as success
      if (!/already processed|message already processed|replay/i.test(msg)) {
        throw e;
      }
    }

    return NextResponse.json({
      ok: true,
      mintTx: mintTxHash || "<already-processed>",
      decoded, // includes mintRecipient & amount for your records
    });
  } catch (e: any) {
    console.error("receiveMessage finalize error:", e);
    return NextResponse.json(
      { ok: false, error: e?.reason || e?.message || "failed" },
      { status: 500 }
    );
  }
}
