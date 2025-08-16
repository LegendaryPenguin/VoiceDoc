"use client";

import React, { useEffect, useRef, useState } from "react";
import AppShell from "./components/AppShell";
import { Mic, MicOff, Send, Lock, Download, Loader2 } from "lucide-react";
import { useEvmAddress } from "@coinbase/cdp-hooks";
import { saveConsult, normalizeAddr, type Consult } from "./lib/consults";

// chat message shape
type Msg = { id: string; role: "user" | "ai"; text: string; at: number };

// minimal Web Speech typings
interface WebSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: { new (): WebSpeechRecognition };
    webkitSpeechRecognition?: { new (): WebSpeechRecognition };
  }
}

export default function Page() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "welcome",
      role: "ai",
      text:
        "Hi, I'm your AI health assistant. Tap the mic, speak naturally, and I'll keep a transcript here.",
      at: 0, // set after mount to avoid hydration mismatch
    },
  ]);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Click mic to speak");
  const [interim, setInterim] = useState(""); // live partial speech
  const [thinking, setThinking] = useState(false); // demo spinner

  // Wallet (string or object in some SDK versions) → normalize to string | undefined
  const evmAddrRaw: any = useEvmAddress();
  const addr = normalizeAddr(evmAddrRaw);

  const recRef = useRef<WebSpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ----- Per-wallet transcript key (stable string) -----
  const storageKey = `voicedoc:${addr ?? "guest"}`;
  const loadedKeyRef = useRef<string | null>(null);

  // stamp stable time after mount
  useEffect(() => {
    setMsgs((m) =>
      m.map((x) => (x.id === "welcome" && x.at === 0 ? { ...x, at: Date.now() } : x))
    );
  }, []);

  // Load ONCE per storageKey (prevents setState loops)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loadedKeyRef.current === storageKey) return; // already loaded for this key

    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Msg[];
        setMsgs(parsed);
      } catch {
        // ignore malformed localStorage
      }
    }
    loadedKeyRef.current = storageKey;
  }, [storageKey]);

  // Persist when msgs or key changes (write-only; safe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(msgs));
  }, [storageKey, msgs]);

  // auto-scroll chat
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, interim, thinking]);

  // init speech recognition
  useEffect(() => {
    const Ctor =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Ctor) {
      setStatus("Speech recognition not supported in this browser");
      return;
    }
    const rec = new Ctor();
    rec.continuous = false; // tap-to-talk
    rec.interimResults = true; // show live text
    rec.lang = "en-US";

    rec.onstart = () => {
      setListening(true);
      setStatus("Listening… speak now");
      setInterim("");
    };

    rec.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        setInterim("");
        pushUser(finalText.trim()); // append to transcript
        simulateAIReply(); // demo; later call backend
      }
    };

    rec.onend = () => {
      setListening(false);
      setStatus("Click mic to speak");
      setInterim("");
    };

    rec.onerror = () => {
      setListening(false);
      setStatus("Mic error — try again");
      setInterim("");
    };

    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {}
    };
  }, []);

  const start = () => recRef.current && !listening && recRef.current.start();
  const stop = () => recRef.current && listening && recRef.current.stop();

  const pushUser = (text: string) =>
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", text, at: Date.now() }]);

  const pushAI = (text: string) =>
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "ai", text, at: Date.now() }]);

  // demo-only reply
  const simulateAIReply = async () => {
    setThinking(true);
    await new Promise((r) => setTimeout(r, 700));
    setThinking(false);
    pushAI("Thanks — I've added that to your transcript. (Demo reply; backend coming soon.)");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    pushUser(input.trim());
    setInput("");
    simulateAIReply();
  };

  /** ------- Save consult (wallet-scoped) + Download TXT summary ------- **/
  // --- REPLACE your current endChatAndDownload with this ---
const endChatAndDownload = () => {
  const fullTxt = summarizeForDoctor(msgs);

  // Analyze the conversation to get: symptomsTitle, synopsis, recommendation
  const { symptomsTitle, synopsis, recommendation } = analyzeConsult(msgs);

  // Rough duration from first->last timestamp (if present)
  const times = msgs.map((m) => m.at).filter((n) => n && n > 0).sort((a, b) => a - b);
  const durationSec =
    times.length >= 2 ? Math.round((times.at(-1)! - times[0]) / 1000) : undefined;

  // Create consult record with new fields
  const consult: Consult = {
    id: crypto.randomUUID(),
    // new fields:
    symptomsTitle,                    // <- TITLE shown on the card
    conversationSummary: synopsis,    // <- DESCRIPTION on the card
    recommendation,                   // <- doctor | monitor

    // keep existing fields for compatibility
    title: symptomsTitle,
    preview: synopsis,
    summary: fullTxt,

    createdAt: Date.now(),
    durationSec,
    messageCount: msgs.length,
  };

  saveConsult(addr, consult);

  // Download TXT summary (unchanged)
  const blob = new Blob([fullTxt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `voicedoc-summary-${ts}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

// --- ADD these helpers (below your other helpers) ---

function analyzeConsult(allMsgs: Msg[]) {
  const users = allMsgs.filter((m) => m.role === "user").map((m) => m.text.trim());
  const allUserLower = users.join(" ").toLowerCase();

  // Symptoms extraction (simple keyword pass)
  const SYMPTOMS = [
    "chest pain","shortness of breath","headache","fever","cough","sore throat",
    "nausea","vomiting","diarrhea","fatigue","rash","dizziness","abdominal pain",
    "stomach pain","back pain","congestion","runny nose","body aches","chills"
  ];
  const found = Array.from(
    new Set(
      SYMPTOMS.filter((s) => allUserLower.includes(s)).map((s) => titleCase(s))
    )
  );

  // Durations like "3 days", "2 weeks"
  const durations = matchAll(allUserLower, /\b\d+\s+(?:day|week|month|year)s?\b/g);

  // Compose short, readable title like "Chest pain, Shortness of breath"
  const symptomsTitle =
    found.length ? found.slice(0, 3).join(", ") : (users[0] || "General symptoms");

  // Build a 1–2 sentence synopsis (card description)
  const durationPart = durations.length ? ` for ${durations[0]}` : "";
  const synopsis = `Patient reports ${symptomsTitle.toLowerCase()}${durationPart}. Conversation captured and summarized for review.`;

  // Recommendation (rule of thumb): red flags → "doctor", else "monitor"
  const RED_FLAGS = [
    "chest pain","shortness of breath","severe headache","fainted","unconscious",
    "heavy bleeding","vision loss","slurred speech","confusion","stiff neck",
    "high fever"
  ];
  const hasRedFlag = RED_FLAGS.some((k) => allUserLower.includes(k));
  const recommendation: "doctor" | "monitor" = hasRedFlag ? "doctor" : "monitor";

  return { symptomsTitle, synopsis, recommendation };
}

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1));
}


  const fmtTime = (ms: number) =>
    ms > 0 ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Heading */}
        <h1 className="text-5xl md:text-6xl font-serif font-bold text-gray-900 text-center leading-tight">
          Hi, I&apos;m <span className="underline decoration-blue-300">VoiceDoc</span>
        </h1>

        <div className="mt-8 space-y-4 text-gray-800 text-lg leading-relaxed">
          <p>I&apos;m your private and personal AI doctor.</p>
          <p>
            As an AI health assistant, my service is fast and free. After we chat, you can book a
            video visit with a top doctor if you want.
          </p>
          <p>What can I help you with today?</p>
        </div>

        {/* Input row */}
        <form
          onSubmit={onSubmit}
          className="mt-6 rounded-2xl border border-[#E8E2D9] bg-white shadow-sm p-2 flex items-stretch gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything about your health"
            className="flex-1 px-4 py-4 rounded-xl outline-none text-gray-900 placeholder:text-gray-400"
            maxLength={1152}
          />

          {/* Mic = recording, MicOff = idle */}
          <button
            type="button"
            onClick={listening ? stop : start}
            className={`rounded-xl px-4 flex items-center justify-center border transition ${
              listening
                ? "bg-red-50 text-red-600 border-red-200"
                : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
            }`}
            aria-pressed={listening}
            aria-label={listening ? "Stop recording" : "Start recording"}
            title={listening ? "Stop recording" : "Start recording"}
          >
            {listening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl px-5 flex items-center gap-2"
          >
            Get Started <Send className="w-4 h-4" />
          </button>
        </form>

        {/* helper row (no counter) */}
        <div className="mt-2 flex items-center justify-end text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" />
            HIPAA compliant &amp; anonymous
          </span>
        </div>

        {/* Transcript panel — rounded, beige background */}
        <div className="mt-8 rounded-2xl border border-[#E8E2D9] bg-[#F6F1E9]">
          {/* top status bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#E8E2D9] text-sm">
            <div className="flex items-center gap-3">
              {listening ? (
                <span className="inline-flex items-center gap-2 text-red-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  Listening…
                </span>
              ) : (
                <span className="text-gray-600">Idle</span>
              )}
              {thinking && (
                <span className="inline-flex items-center gap-2 text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating reply…
                </span>
              )}
            </div>
            <button
              onClick={endChatAndDownload}
              className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900"
              title="Download summary (later: mint)"
            >
              <Download className="w-4 h-4" />
              End Chat
            </button>
          </div>

          {/* scrollable chat area */}
          <div ref={scrollRef} className="max-h-[420px] overflow-y-auto p-4 md:p-6 space-y-4">
            {msgs.map((m) => {
              const bubble =
                m.role === "user"
                  ? "ml-auto bg-blue-600 text-white"
                  : "bg-white text-gray-800 border border-[#E8E2D9]";
              return (
                <div key={m.id}>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                    {m.role === "user" ? "You" : "VoiceDoc"} · {fmtTime(m.at)}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed ${bubble}`}>
                    {m.text}
                  </div>
                </div>
              );
            })}

            {/* live interim bubble while speaking */}
            {listening && interim && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">You · now</div>
                <div className="max-w-[85%] ml-auto rounded-2xl px-4 py-3 bg-blue-50 text-blue-900 border border-blue-200">
                  {interim}
                </div>
              </div>
            )}
          </div>

          {/* bottom hint bar */}
          <div className="px-4 py-2 border-t border-[#E8E2D9] text-xs text-gray-600">
            Tip: Tap <b>Mic</b>, speak, then tap <b>Mic</b> again to stop. We’ll keep a complete
            transcript here.
          </div>
        </div>

        {/* small mic status under chat */}
        <div className="mt-3 text-sm">
          <span className={`${listening ? "text-red-600" : "text-blue-600"} font-medium`}>
            {status}
          </span>
        </div>
      </div>
    </AppShell>
  );
}

/** ========= Helper: build a doctor-friendly TXT summary ========= **/
function summarizeForDoctor(allMsgs: Msg[]): string {
  const users = allMsgs.filter((m) => m.role === "user").map((m) => m.text.trim());
  const ais = allMsgs.filter((m) => m.role === "ai").map((m) => m.text.trim());
  const allUserText = users.join("\n").toLowerCase();

  const chiefComplaint = users[0] || "Not provided";

  const pickLines = (keywords: RegExp[]) =>
    users.filter((t) => keywords.some((k) => k.test(t.toLowerCase())));

  const meds = pickLines([
    /\bmeds?\b|\bmedication\b|\bpill\b|\bdose\b|\bmg\b|\btaking\b|\btake\b/,
    /\bibuprofen|advil|tylenol|acetaminophen|paracetamol|amoxicillin|metformin|statin\b/,
  ]);

  const allergies = pickLines([/\ballerg/i, /\brash\b/, /\banaphylaxis\b/]);

  const history = pickLines([
    /\bhistory\b|\bdiagnosed\b|\bsurgery\b|\boperation\b|\bdiabetes\b|\bhypertension\b|\basthma\b/,
  ]);

  const vitals = pickLines([
    /\btemp|temperature|fever|°f|°c\b/,
    /\bbp\b|\bblood pressure\b/,
    /\bbpm\b|\bheart rate\b/,
    /\bspo2\b|\boxygen\b/,
  ]);

  const onset = matchAll(
    allUserText,
    /\b(since|for|started|onset)\b.*?(?:\bago\b|days?|weeks?|months?|years?)/g
  );
  const durations = matchAll(allUserText, /\b\d+\s+(?:day|week|month|year)s?\b/g);

  const redFlagsList = [
    "chest pain",
    "shortness of breath",
    "severe headache",
    "fainted",
    "unconscious",
    "heavy bleeding",
    "vision loss",
    "slurred speech",
    "confusion",
    "stiff neck",
    "high fever",
    "pregnant",
    "suicid",
    "overdose",
  ];
  const redFlags = redFlagsList.filter((k) => allUserText.includes(k));

  const lines = [
    "VoiceDoc — Visit Summary (Auto-generated)",
    `Date: ${new Date().toLocaleString()}`,
    "",
    "Patient:",
    "  • Anonymous (no identity collected in this session)",
    "",
    "Chief Complaint:",
    `  • ${chiefComplaint}`,
    "",
    "Symptom Summary (patient statements):",
    ...(users.length ? users.map((u) => `  • ${u}`) : ["  • Not provided"]),
    "",
    "Onset / Duration (parsed):",
    `  • Phrases: ${onset.length ? onset.join("; ") : "—"}`,
    `  • Durations: ${durations.length ? durations.join("; ") : "—"}`,
    "",
    "Medications Mentioned:",
    ...(meds.length ? meds.map((m) => `  • ${m}`) : ["  • —"]),
    "",
    "Allergies Mentioned:",
    ...(allergies.length ? allergies.map((m) => `  • ${m}`) : ["  • —"]),
    "",
    "Relevant History (self-reported):",
    ...(history.length ? history.map((m) => `  • ${m}`) : ["  • —"]),
    "",
    "Home Measurements / Vitals Mentioned:",
    ...(vitals.length ? vitals.map((m) => `  • ${m}`) : ["  • —"]),
    "",
    "Potential Red Flags (keyword scan):",
    `  • ${redFlags.length ? redFlags.join(", ") : "None detected based on keywords"}`,
    "",
    "AI Guidance Given (high-level):",
    ...(ais.length ? ais.map((a) => `  • ${a}`) : ["  • —"]),
    "",
    "Next Steps Discussed:",
    "  • —",
    "",
    "Disclaimer:",
    "  • This summary is auto-generated for clinical review and is not medical advice.",
  ];

  return lines.join("\n");
}

function matchAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(text))) out.push(m[0]);
  return out;
}
