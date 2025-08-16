"use client";

import React, { useEffect, useRef, useState } from "react";
import AppShell from "./components/AppShell";
import { Mic, MicOff, Send, Lock } from "lucide-react";

// chat message
type Msg = { id: string; role: "user" | "ai"; text: string; at: Date };

// minimal web speech typings
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
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Click mic to speak");

  const recRef = useRef<WebSpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // auto-scroll chat
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

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
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      setListening(true);
      setStatus("Listening… speak now");
    };

    rec.onresult = (e: any) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
      }
      if (finalText.trim()) {
        pushUser(finalText.trim()); // just append to chat
      }
    };

    rec.onend = () => {
      setListening(false);
      setStatus("Click mic to speak");
    };

    rec.onerror = () => {
      setListening(false);
      setStatus("Mic error — try again");
    };

    recRef.current = rec;
    return () => rec.stop();
  }, []);

  const start = () => recRef.current && !listening && recRef.current.start();
  const stop = () => recRef.current && listening && recRef.current.stop();

  const pushUser = (text: string) =>
    setMsgs((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text, at: new Date() },
    ]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    pushUser(input.trim()); // for now: only append, no AI call
    setInput("");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Heading block (mirrors screenshot style) */}
        <h1 className="text-5xl md:text-6xl font-serif font-bold text-gray-900 text-center leading-tight">
          Hi, I'm <span className="underline decoration-blue-300">VoiceDoc</span>
        </h1>

        <div className="mt-8 space-y-4 text-gray-800 text-lg leading-relaxed">
          <p>I'm your private and personal AI doctor.</p>
          <p>
            As an AI doctor, my service is fast and free. After we chat, if you
            want, you can book a video visit with a top doctor.
          </p>
          <p>What can I help you with today?</p>
        </div>

        {/* Input row like the screenshot */}
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
          {/* mic toggle */}
          <button
            type="button"
            onClick={listening ? stop : start}
            className={`rounded-xl px-4 flex items-center justify-center transition ${
              listening
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
            }`}
            aria-pressed={listening}
            title={status}
          >
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl px-5 flex items-center gap-2"
          >
            Get Started <Send className="w-4 h-4" />
          </button>
        </form>

        {/* helper row (counter + HIPAA line) */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>{`${input.length} / 1152`}</span>
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" />
            HIPAA compliant & anonymous
          </span>
        </div>

        {/* Chat panel with warm beige border */}
        <div className="mt-8 rounded-2xl border-2 border-[#E8E2D9] bg-white/90">
          <div
            ref={scrollRef}
            className="max-h-[420px] overflow-y-auto p-4 md:p-6 space-y-3"
          >
            {msgs.length === 0 && (
              <div className="text-gray-500 text-sm">
                Your messages will appear here. Use the mic or type a question.
              </div>
            )}

            {msgs.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "ml-auto bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
        </div>

        {/* small mic status under chat */}
        <div className="mt-3 text-sm">
          <span
            className={`${
              listening ? "text-red-600" : "text-blue-600"
            } font-medium`}
          >
            {status}
          </span>
        </div>
      </div>
    </AppShell>
  );
}
