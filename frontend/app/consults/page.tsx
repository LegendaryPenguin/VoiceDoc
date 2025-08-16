"use client";

import React, { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { MessageCircle, Clock } from "lucide-react";
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    setItems(loadConsults(addr));
  }, [addr]);

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

  const fmtDate = (ms: number) => new Date(ms).toLocaleString();
  const fmtDuration = (sec?: number) =>
    sec ? `${Math.max(1, Math.round(sec / 60))} min` : "—";

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Your Consults</h1>
          <p className="text-gray-600">
            Please note that VoiceDoc is for general information only and is not medical advice, doesn’t create a doctor–patient relationship, and shouldn’t be relied on for diagnosis or treatment. If you are having an emergency or feel rising symptoms, please call 911 or visit your local doctor.
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
