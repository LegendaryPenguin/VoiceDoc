"use client";

import React, { useEffect, useRef, useState } from "react";
import AppShell from "./components/AppShell";
import { Mic, MicOff, MessageCircle, Brain, Zap, Shield } from "lucide-react";

// Simple chat message type
type Msg = { id: string; role: "user" | "ai"; text: string; at: Date };

// Minimal Web Speech typings
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
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Click to start speaking");
  const [typing, setTyping] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "seed",
      role: "ai",
      text:
        "Welcome! I'm your AI healthcare assistant. Tell me your symptoms or ask a question.",
      at: new Date(),
    },
  ]);

  const recRef = useRef<WebSpeechRecognition | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // init speech recognition once
  useEffect(() => {
    const Ctor =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Ctor) {
      setStatus("Speech recognition not supported in this browser");
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      setListening(true);
      setStatus("Listening... speak now");
    };
    rec.onresult = (e: any) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
      }
      if (finalText.trim()) {
        pushUser(finalText.trim());
        handleUser(finalText.trim());
      }
    };
    rec.onend = () => {
      setListening(false);
      setStatus("Click to start speaking");
    };
    rec.onerror = () => {
      setListening(false);
      setStatus("Microphone error — try again");
    };

    recRef.current = rec;
    return () => rec.stop();
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  const start = () => recRef.current && !listening && recRef.current.start();
  const stop = () => recRef.current && listening && recRef.current.stop();

  const pushUser = (text: string) =>
    setMsgs((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text, at: new Date() },
    ]);

  const pushAI = (text: string) =>
    setMsgs((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "ai", text, at: new Date() },
    ]);

  // Basic TTS
  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1;
    const assign = () => {
      const voices = speechSynthesis.getVoices();
      u.voice =
        voices.find((v) => v.lang.startsWith("en") && v.name.includes("Google")) ??
        voices.find((v) => v.lang.startsWith("en")) ??
        voices[0];
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = assign;
    } else assign();
  };

  // Replace this mock with your Chainlink Functions call
  const handleUser = async (input: string) => {
    setTyping(true);
    await new Promise((r) => setTimeout(r, 1000)); // simulate latency
    const reply = mockTriage(input);
    setTyping(false);
    pushAI(reply);
    speak(reply);
  };

  const mockTriage = (q: string) => {
    const bank = [
      "Thanks. I can share general info, but please consult a clinician for diagnosis.",
      "Based on what you said, consider rest, fluids, and monitoring. If symptoms worsen, seek care.",
      "I can prep a summary for a telehealth visit. Want me to book one?",
      "Got it. Let me ask a few follow-ups to narrow this down.",
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  };

  return (
    <AppShell>
      <div className="p-6 mx-auto max-w-4xl">
        {/* Hero card */}
        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-gray-200 mb-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-pulse" />
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Hi, I’m MediVoice
            </h1>
            <p className="text-gray-600 mt-3">
              Your AI-powered healthcare assistant
            </p>
          </div>

          {/* Mic button + status */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <button
              onClick={listening ? stop : start}
              className={`w-24 h-24 rounded-full text-white text-3xl transition-all shadow-lg relative overflow-hidden ${
                listening
                  ? "bg-gradient-to-br from-red-500 to-red-600 animate-pulse"
                  : "bg-gradient-to-br from-blue-500 to-purple-600 hover:scale-105"
              }`}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Start listening"}
            >
              {listening ? <MicOff /> : <Mic />}
              {listening && (
                <span className="absolute inset-0 rounded-full border-4 border-red-300 animate-ping opacity-70" />
              )}
            </button>
            <div
              className={`text-sm font-medium ${
                listening ? "text-red-600" : "text-blue-600"
              }`}
            >
              {status}
            </div>
          </div>

          {/* Chat window */}
          <div
            ref={scrollerRef}
            className="bg-gray-50 rounded-2xl p-4 md:p-6 max-h-96 overflow-y-auto border border-gray-200"
          >
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`mb-3 p-4 rounded-2xl max-w-[80%] ${
                  m.role === "user"
                    ? "ml-auto text-white bg-gradient-to-r from-blue-500 to-purple-600 text-right"
                    : "bg-white border border-gray-200 text-gray-800"
                }`}
              >
                {m.text}
              </div>
            ))}
            {typing && (
              <div className="text-blue-600 text-sm p-3">AI is thinking…</div>
            )}
          </div>
        </div>

        {/* Feature tiles */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Tile
            icon={<MessageCircle className="w-7 h-7 text-white" />}
            title="Voice Recognition"
            desc="Natural conversation via your browser mic"
            grad="from-blue-500 to-purple-600"
          />
          <Tile
            icon={<Brain className="w-7 h-7 text-white" />}
            title="AI Analysis"
            desc="Symptom triage & guidance (demo)"
            grad="from-purple-500 to-pink-600"
          />
          <Tile
            icon={<Zap className="w-7 h-7 text-white" />}
            title="Instant Response"
            desc="Fast feedback 24/7"
            grad="from-green-500 to-teal-600"
          />
          <Tile
            icon={<Shield className="w-7 h-7 text-white" />}
            title="Privacy Secure"
            desc="Keep PHI off-chain; encrypt uploads"
            grad="from-red-500 to-orange-600"
          />
        </div>
      </div>
    </AppShell>
  );
}

function Tile({
  icon,
  title,
  desc,
  grad,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  grad: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 text-center border border-gray-200 shadow-sm hover:-translate-y-1 transition">
      <div
        className={`w-14 h-14 rounded-xl bg-gradient-to-br ${grad} mx-auto mb-4 flex items-center justify-center`}
      >
        {icon}
      </div>
      <div className="font-semibold text-gray-900">{title}</div>
      <div className="text-sm text-gray-600 mt-1">{desc}</div>
    </div>
  );
}
