"use client";

import React, { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { MessageCircle, Clock, Loader } from "lucide-react";
import { ethers } from 'ethers';
import { useEvmAddress } from "@coinbase/cdp-hooks";
import { loadConsults, normalizeAddr, type Consult } from "../lib/consults";

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
          const status = await getEscrowStatus(consult.contract_address);
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
      const provider = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology');
      
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
