"use client";

import React, { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { MessageCircle, Clock, Loader } from "lucide-react";
import { ethers } from 'ethers';
import { useEvmAddress } from "@coinbase/cdp-hooks";
import { loadConsults, normalizeAddr, type Consult } from "../lib/consults";
import { POLYGON_AMOY_RPC_URL, POLYGON_AMOY_USDC_CONTRACT_ADDRESS } from "@/lib/constants";

const AMOY_CHAIN_ID_HEX = "0x13882"; // 80002


 // --- Chain switch helper for Polygon Amoy (80002) ---
const POLYGON_AMOY_CHAIN_ID_HEX = "0x13882"; // 80002

// Minimal write ABI for escrow
const ESCROW_WRITE_ABI = [
  "function approveRelease() external",
  "function approveRefund() external",
  "function depositor() view returns (address)",
  "function beneficiary() view returns (address)",
];

// Minimal ERC-20 (USDC) ABI used here
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)"
];

// Read + write parts we need from the escrow
const ESCROW_RW_ABI = [
  "function depositor() view returns (address)",
  "function amount() view returns (uint256)",
  "function deposit() external"
];



/* ---------- Helpers to normalize legacy consults ---------- */

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1));
}

function deriveSymptomsFromSummary(text = ""): string {
  const lower = text.toLowerCase();
  const SYMPTOMS = [
    "chest pain",
    "shortness of breath",
    "headache",
    "fever",
    "cough",
    "sore throat",
    "nausea",
    "vomiting",
    "diarrhea",
    "fatigue",
    "rash",
    "dizziness",
    "abdominal pain",
    "stomach pain",
    "back pain",
    "congestion",
    "runny nose",
    "body aches",
    "chills",
  ];
  const found = Array.from(
    new Set(SYMPTOMS.filter((s) => lower.includes(s)).map(titleCase))
  );
  return found.slice(0, 3).join(", ");
}

function deriveSynopsisFromSummary(text = ""): string {
  if (!text) return "Conversation captured and summarized for review.";
  const m = text.match(
    /Symptom Summary.*?:\s*([\s\S]*?)(?:\n\s*\n|Onset|Medications|Allergies|Relevant History|Home Measurements)/i
  );
  const candidate = (m?.[1] || text).replace(/\s+/g, " ").trim();
  const firstSentence = candidate.split(/(?<=[.!?])\s+/)[0] || candidate;
  const base = firstSentence.length <= 260 ? firstSentence : candidate.slice(0, 260) + "…";
  return base;
}

/* --------------------------------------------------------- */

export default function ConsultsPage() {
  const evmAddrRaw: any = useEvmAddress();
  const addr = normalizeAddr(evmAddrRaw);
  const [items, setItems] = useState<Consult[]>([]);
  const [escrowStatuses, setEscrowStatuses] = useState<Record<string, string>>({});
  const [txBusy, setTxBusy] = useState<Record<string, "release" | "refund" | null>>({});

  async function ensureAmoyNetwork(): Promise<void> {
    // window.ethereum is injected by Coinbase Embedded Wallet
    // @ts-ignore
    const eth = window?.ethereum;
    if (!eth) throw new Error("Wallet provider not found");
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: POLYGON_AMOY_CHAIN_ID_HEX }],
      });
    } catch (e: any) {
      // If chain not added, add and then switch
      if (e?.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: POLYGON_AMOY_CHAIN_ID_HEX,
            chainName: "Polygon Amoy",
            nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
            rpcUrls: ["https://rpc-amoy.polygon.technology"],
            blockExplorerUrls: ["https://amoy.polygonscan.com"],
          }],
        });
      } else {
        throw e;
      }
    }
  }

  const approveAndDeposit = async (contractAddress: string) => {
    try {
      // 1) Ensure wallet & switch to Amoy
      // @ts-ignore
      const eth = window?.ethereum;
      if (!eth) throw new Error("Wallet not found");
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: AMOY_CHAIN_ID_HEX }],
      });

      const provider = new ethers.BrowserProvider(eth);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const caller = await signer.getAddress();

      // 2) Read depositor & amount from the escrow (authoritative)
      const escrow = new ethers.Contract(contractAddress, ESCROW_RW_ABI, signer);
      const [depositorAddr, amount] = await Promise.all([
        escrow.depositor(),
        escrow.amount(), // uint256 in 6 dp
      ]);

      if (caller.toLowerCase() !== depositorAddr.toLowerCase()) {
        throw new Error("Connect the depositor wallet to fund this escrow.");
      }

      // 3) Check USDC balance and allowance
      const usdc = new ethers.Contract(
        POLYGON_AMOY_USDC_CONTRACT_ADDRESS,
        ERC20_ABI,
        signer
      );

      const [bal, allowance] = await Promise.all([
        usdc.balanceOf(caller),
        usdc.allowance(caller, contractAddress),
      ]);

      if ((bal as bigint) < (amount as bigint)) {
        throw new Error("Insufficient USDC balance on Polygon Amoy.");
      }

      if ((allowance as bigint) < (amount as bigint)) {
        const txA = await usdc.approve(contractAddress, amount);
        await txA.wait();
      }

      // 4) Call deposit()
      const tx = await escrow.deposit();
      await tx.wait();

      // 5) Refresh this row’s status
      const updated = await getEscrowStatus(contractAddress);
      setEscrowStatuses((m) => {
        const k = Object.keys(m).find((id) => items.find((c) => c.id === id && c.contractAddress === contractAddress));
        return k ? { ...m, [k]: updated.stage } : m;
      });
    } catch (e: any) {
      console.error("approveAndDeposit error:", e);
      alert(e?.message || "Funding failed");
    }
  };


  async function handleApproveRelease(consult: Consult) {
    if (!consult.contractAddress) return;
    try {
      setTxBusy((m) => ({ ...m, [consult.id]: "release" }));
      await ensureAmoyNetwork();

      // signer from embedded wallet
      // @ts-ignore
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const caller = await signer.getAddress();

      // optional pre-check to avoid revert: ensure caller is depositor or beneficiary
      const readABI = [
        "function depositor() view returns (address)",
        "function beneficiary() view returns (address)",
        "function stage() view returns (uint8)",
      ];
      const readCtr = new ethers.Contract(consult.contractAddress, readABI, provider);
      const [dep, ben, st] = await Promise.all([readCtr.depositor(), readCtr.beneficiary(), readCtr.stage()]);
      const isAuthorized =
        caller.toLowerCase() === dep.toLowerCase() ||
        caller.toLowerCase() === ben.toLowerCase();
      if (!isAuthorized) throw new Error("Only depositor or beneficiary can approve release");
      if (Number(st) !== 1) throw new Error("Escrow not in FUNDED stage");

      // write call
      const escrow = new ethers.Contract(consult.contractAddress, ESCROW_WRITE_ABI, signer);
      const tx = await escrow.approveRelease();
      await tx.wait();

      // refresh status row
      const status = await getEscrowStatus(consult.contractAddress);
      setEscrowStatuses((m) => ({ ...m, [consult.id]: status.stage }));
    } catch (err: any) {
      console.error("approveRelease failed:", err);
      alert(err?.message || "approveRelease failed");
    } finally {
      setTxBusy((m) => ({ ...m, [consult.id]: null }));
    }
  }

  async function handleApproveRefund(consult: Consult) {
    if (!consult.contractAddress) return;
    try {
      setTxBusy((m) => ({ ...m, [consult.id]: "refund" }));
      await ensureAmoyNetwork();

      // signer from embedded wallet
      // @ts-ignore
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const caller = await signer.getAddress();

      // optional pre-check to avoid revert
      const readABI = [
        "function depositor() view returns (address)",
        "function beneficiary() view returns (address)",
        "function stage() view returns (uint8)",
      ];
      const readCtr = new ethers.Contract(consult.contractAddress, readABI, provider);
      const [dep, ben, st] = await Promise.all([readCtr.depositor(), readCtr.beneficiary(), readCtr.stage()]);
      const isAuthorized =
        caller.toLowerCase() === dep.toLowerCase() ||
        caller.toLowerCase() === ben.toLowerCase();
      if (!isAuthorized) throw new Error("Only depositor or beneficiary can approve refund");
      if (Number(st) !== 1) throw new Error("Escrow not in FUNDED stage");

      // write call
      const escrow = new ethers.Contract(consult.contractAddress, ESCROW_WRITE_ABI, signer);
      const tx = await escrow.approveRefund();
      await tx.wait();

      // refresh status row
      const status = await getEscrowStatus(consult.contractAddress);
      setEscrowStatuses((m) => ({ ...m, [consult.id]: status.stage }));
    } catch (err: any) {
      console.error("approveRefund failed:", err);
      alert(err?.message || "approveRefund failed");
    } finally {
      setTxBusy((m) => ({ ...m, [consult.id]: null }));
    }
  }


  useEffect(() => {
    if (typeof window === "undefined") return;
    setItems(loadConsults(addr));
  }, [addr]);

  // Load escrow statuses for all consults
  useEffect(() => {
    const loadEscrowStatuses = async () => {
      const statuses: Record<string, string> = {};
      
      for (const consult of items) {
        try {
          const status = await getEscrowStatus(consult.contractAddress);
          statuses[consult.id] = status.stage;
        } catch (error) {
          console.error(`Error loading escrow status for ${consult.id}:`, error);
          statuses[consult.id] = 'ERROR';
        }
      }
      
      setEscrowStatuses(statuses);
    };

    if (items.length > 0) {
      loadEscrowStatuses();
    }
  }, [items]);

  const download = (c: Consult) => {
    const text =
      c.conversationSummary ||
      c.summary ||
      c.preview ||
      c.symptomsTitle ||
      "Consult";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voicedoc-summary-${new Date(c.createdAt)
      .toISOString()
      .replace(/[:.]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

    // Get escrow contract status
  const getEscrowStatus = async (contractAddress?: string) => {
    try {
      if (!contractAddress) return { stage: "NO APPOINTMENT" };

      // Create a provider for Polygon Amoy
      const provider = new ethers.JsonRpcProvider(POLYGON_AMOY_RPC_URL);
      
      // Minimal ABI for the escrow contract - only need the stage function
      const escrowABI = [
        'function stage() view returns (uint8)',
        'function depositor() view returns (address)',
        'function beneficiary() view returns (address)',
        'function amount() view returns (uint256)',
        'function balance() view returns (uint256)',
        'function depositorReleaseOk() view returns (bool)',
        'function beneficiaryReleaseOk() view returns (bool)',
        'function depositorRefundOk() view returns (bool)',
        'function beneficiaryRefundOk() view returns (bool)'
      ];
      
      // Create contract instance
      const contract = new ethers.Contract(contractAddress, escrowABI, provider);
      
      // Get the stage (enum value)
      const stageValue = await contract.stage();
      
      // Convert enum value to string
      const stages = ['OPEN', 'FUNDED', 'RELEASED', 'REFUNDED'];
      const stageName = stages[Number(stageValue)] || 'UNKNOWN';
      
      // Get additional contract info
      const [depositor, beneficiary, amount, balance, depReleaseOk, benReleaseOk, depRefundOk, benRefundOk] = await Promise.all([
        contract.depositor(),
        contract.beneficiary(),
        contract.amount(),
        contract.balance(),
        contract.depositorReleaseOk(),
        contract.beneficiaryReleaseOk(),
        contract.depositorRefundOk(),
        contract.beneficiaryRefundOk()
      ]);
      
      return {
        stage: stageName,
        stageValue: Number(stageValue),
        depositor,
        beneficiary,
        amount: ethers.formatUnits(amount, 6), // USDC has 6 decimals
        balance: ethers.formatUnits(balance, 6),
        approvals: {
          depositorReleaseOk: depReleaseOk,
          beneficiaryReleaseOk: benReleaseOk,
          depositorRefundOk: depRefundOk,
          beneficiaryRefundOk: benRefundOk
        }
      };
    } catch (error) {
      console.error('Error getting escrow status:', error);
      throw error;
    }
  };

  const fmtDate = (ms: number) => new Date(ms).toLocaleString();
  const fmtDuration = (sec?: number) =>
    sec ? `${Math.max(1, Math.round(sec / 60))} min` : "—";

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Your Consults</h1>
          <p className="text-gray-600">
            Please note that VoiceDoc is for general information only and is not medical advice, doesn't create a doctor–patient relationship, and shouldn’t be relied on for diagnosis or treatment. If you are having an emergency or feel rising symptoms, please call 911 or visit your local doctor.
          </p>
        </div>

        <div className="space-y-4 mt-6">
          {items.map((c) => {
            // Fallbacks for legacy records
            const title =
              c.symptomsTitle ||
              deriveSymptomsFromSummary(c.summary || c.preview || "") ||
              c.title ||
              "Consult";

            const desc =
              c.conversationSummary ||
              deriveSynopsisFromSummary(c.summary || c.preview || "");

            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-black"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-blue-600" />
                    </div>

                    <div>
                      {/* Title = summarized symptoms */}
                      <h3 className="font-semibold text-gray-900">{title}</h3>

                      {/* Description = summary of the conversation (max 3 lines) */}
                      <p
                        className="text-gray-600 mt-1"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical" as const,
                          overflow: "hidden",
                        }}
                      >
                        {desc}
                      </p>

                      {/* Meta row (date, duration, msgs, recommendation) */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 mt-3">
                        <div className="inline-flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{fmtDate(c.createdAt)}</span>
                        </div>
                        <span>Duration: {fmtDuration(c.durationSec)}</span>
                        <span>{c.messageCount} messages</span>

                        {c.recommendation && (
                          <span
                            className={`px-2 py-0.5 rounded-full border text-xs ${
                              c.recommendation === "doctor"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {c.recommendation === "doctor"
                              ? "Doctor recommended"
                              : "Monitor symptoms"}
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1">
                          <Loader className="w-4 h-4" /> Escrow Status: 
                          <span
                            className={`px-2 py-0.5 rounded-full border text-xs ${
                              escrowStatuses[c.id] === "NO APPOINTMENT"
                                ? "bg-red-50 text-gray-700 border-gray-200"
                                : "bg-amber-50 text-green-700 border-green-200"
                            }`}
                          >
                            {escrowStatuses[c.id] || 'Loading...'}
                          </span>
                          {/* NEW: Deposit to Escrow button (only when OPEN) */}
                          {escrowStatuses[c.id] === "OPEN" && c.contractAddress && (
                            <button
                              onClick={() => approveAndDeposit(c.contractAddress!)}
                              className="ml-2 px-2.5 py-1 rounded-md text-xs font-medium border bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                              title="Approve USDC & fund the escrow from the depositor wallet"
                            >
                              Deposit to Escrow
                            </button>
                          )}
                          {/* Action buttons (only when FUNDED) */}
                          {escrowStatuses[c.id] === "FUNDED" && c.contractAddress && (
                            <span className="inline-flex items-center gap-2 ml-2">
                              <button
                                onClick={() => handleApproveRelease(c)}
                                disabled={!!txBusy[c.id]}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                                  txBusy[c.id] === "release"
                                    ? "bg-blue-100 text-blue-600 border-blue-200 cursor-wait"
                                    : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                                }`}
                                title="Both depositor and beneficiary must approve to release funds"
                              >
                                {txBusy[c.id] === "release" ? "Approving…" : "Approve Release"}
                              </button>

                              <button
                                onClick={() => handleApproveRefund(c)}
                                disabled={!!txBusy[c.id]}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                                  txBusy[c.id] === "refund"
                                    ? "bg-amber-100 text-amber-700 border-amber-200 cursor-wait"
                                    : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
                                }`}
                                title="Both depositor and beneficiary must approve to refund"
                              >
                                {txBusy[c.id] === "refund" ? "Approving…" : "Approve Refund"}
                              </button>
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => download(c)}
                    className="text-blue-600 hover:underline"
                  >
                    Download summary
                  </button>
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-gray-300">
              <p className="text-gray-600">
                No consults yet. End a chat to save it here.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
