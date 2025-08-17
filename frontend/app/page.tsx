'use client';

import React, { useEffect, useRef, useState } from 'react';
import AppShell from './components/AppShell';
import { Mic, MicOff, Send, Lock, Download, Loader2, Zap, Plus } from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { saveConsult, normalizeAddr, type Consult } from './lib/consults';
import ChatGPTConsumerWidget from './components/ChatGPTConsumerWidget';
import { burnFromBase } from "../lib/hooks/burn";
import { ScheduleDay, formatSlotForHuman, dateFromRawLocal } from '@/lib/utils/schedule';
import SchedulePicker from './components/SchedulePicker';
import TokenBalanceBadge from './components/TokenBalanceBadge';

export type Msg = {
  id: string;
  role: 'user' | 'ai';
  at: number;
  text?: string;
  schedule?: ScheduleDay[];
};

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
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 'welcome',
      role: 'ai',
      text:
        "Hi, I'm your AI health assistant. Tap the mic, speak naturally, and I'll keep a transcript here.",
      at: 0,
    },
  ]);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('Click mic to speak');
  const [interim, setInterim] = useState('');
  const [thinking, setThinking] = useState(false);
  const [burning, setBurning] = useState(false); // burn transaction state
  const [deploying, setDeploying] = useState(false); // deploy contract state
  const [statusMessage, setStatusMessage] = useState<string | null>(null); // status messages
  const [contractAddress, setContractAddress] = useState<string | undefined>(undefined); // deployed contract address
  const [appointmentDate, setAppointmentDate] = useState<Date | null>(null);

  // wallet
  const evmAddrRaw: any = useEvmAddress();
  const addr = normalizeAddr(evmAddrRaw);

  const recRef = useRef<WebSpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // transcript storage key
  const storageKey = `voicedoc:${addr ?? 'guest'}`;
  const loadedKeyRef = useRef<string | null>(null);

  // Chainlink submit controls to drive the widget
  const [cnTrigger, setCnTrigger] = useState(0);
  const [extQuestion, setExtQuestion] = useState<string>('');

  // Track a placeholder AI bubble so we can replace it in place
  const pendingAiIdRef = useRef<string | null>(null);

  // ===== TTS state/refs =====
  const [ttsOn, setTtsOn] = useState(true);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicePref, setVoicePref] = useState<string>(''); // auto-pick if empty
  const [rate, setRate] = useState(1);   // 0.1 - 10
  const [pitch, setPitch] = useState(1); // 0 - 2

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    synthRef.current = synth;

    const loadVoices = () => {
      const v = synth.getVoices();
      setVoices(v);
      if (!voicePref && v.length) {
        const cand =
          v.find(x => x.name.toLowerCase().includes('samantha')) ||
          v.find(x => x.lang?.toLowerCase().startsWith('en'));
        if (cand) setVoicePref(cand.name);
      }
    };

    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
    return () => synth.removeEventListener?.('voiceschanged', loadVoices);
  }, [voicePref]);

  const speak = (text: string) => {
    if (!ttsOn) return;
    const synth = synthRef.current;
    if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') return;
    try {
      synth.cancel(); // clear any queued/stuck speech
      const u = new SpeechSynthesisUtterance(text);
      const chosen =
        voices.find(v => v.name === voicePref) ||
        voices.find(v => v.lang?.toLowerCase().startsWith('en')) ||
        undefined;
      if (chosen) u.voice = chosen;
      u.rate = rate;
      u.pitch = pitch;
      synth.speak(u);
    } catch {
      // ignore
    }
  };

  // stamp stable time after mount
  useEffect(() => {
    setMsgs((m) =>
      m.map((x) => (x.id === 'welcome' && x.at === 0 ? { ...x, at: Date.now() } : x)),
    );
  }, []);

  // Load once per key
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loadedKeyRef.current === storageKey) return;

    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Msg[];
        setMsgs(parsed);
      } catch {
        // ignore malformed
      }
    }
    loadedKeyRef.current = storageKey;
  }, [storageKey]);

  // Persist transcript
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(storageKey, JSON.stringify(msgs));
  }, [storageKey, msgs]);

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, interim, thinking]);

  const pushUser = (text: string) =>
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'user', text, at: Date.now() }]);

  const pushAI = (text: string) => {
    const id = crypto.randomUUID();
    setMsgs((m) => [...m, { id, role: 'ai', text, at: Date.now() }]);
    return id;
  };

  const replaceMsgText = (id: string, newText: string) =>
    setMsgs((m) => m.map((msg) => (msg.id === id ? { ...msg, text: newText } : msg)));

  // Centralized "send" from input or speech
  const handleUserQuestion = (q: string) => {
    if (!q.trim()) return;
    pushUser(q.trim());
    // show a placeholder AI bubble and remember its id
    setThinking(true);
    const placeholderId = pushAI('Thinking…');
    pendingAiIdRef.current = placeholderId;
    // drive the widget
    setExtQuestion(q.trim());
    setCnTrigger((t) => t + 1);
  };

  // init speech recognition
  useEffect(() => {
    const Ctor =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Ctor) {
      setStatus('Speech recognition not supported in this browser');
      return;
    }
    const rec = new Ctor();
    rec.continuous = false; // tap-to-talk
    rec.interimResults = true; // live text
    rec.lang = 'en-US';

    rec.onstart = () => {
      // stop TTS so mic is clean
      synthRef.current?.cancel();

      setListening(true);
      setStatus('Listening… speak now');
      setInterim('');
    };

    rec.onresult = (e: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        setInterim('');
        handleUserQuestion(finalText.trim());
      }
    };

    rec.onend = () => {
      setListening(false);
      setStatus('Click mic to speak');
      setInterim('');
    };

    rec.onerror = () => {
      setListening(false);
      setStatus('Mic error — try again');
      setInterim('');
    };

    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {}
    };
  }, [handleUserQuestion]);

  const start = () => recRef.current && !listening && recRef.current.start();
  const stop = () => recRef.current && listening && recRef.current.stop();

  // Submit from input bar
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleUserQuestion(input.trim());
    setInput('');
  };

  //region == ESCROW ==
  const handleEscrowPayment = async () => {
    if (deploying) return; // Prevent multiple clicks
    if (!addr) return; // Requires patient address
    
    setDeploying(true);
    setStatusMessage("Deploying escrow contract...");
    
    try {
      const depositorAddress = addr;
      const beneficiaryAddress = "0x0987654321098765432109876543210987654321"; // THIS IS THE DRS ADDRESS
      const amountUSDC = 2; // 2 USDC
      
      setStatusMessage("Sending deployment request...");
      
      const response = await fetch("/api/contracts/escrow/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agreement: {
            depositor_wallet_address: depositorAddress,
            beneficiary_wallet_address: beneficiaryAddress,
          },
          amountUSDC,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.contractAddress) {
        setContractAddress(data.contractAddress);
        setStatusMessage(`Contract deployed successfully! Address: ${data.contractAddress}`);
        pushAI(`Escrow contract deployed successfully! Contract address: ${data.contractAddress}. Transaction hash: ${data.txHash}`);
        
        // Clear status after 10 seconds (longer for contract address visibility)
        setTimeout(() => setStatusMessage(null), 10000);
        await handleBurnFromBase(data.contractAddress);
      } else {
        throw new Error("Deployment failed - no contract address returned");
      }
    } catch (error: any) {
      console.error("Contract deployment failed:", error);
      setStatusMessage(`Error: ${error.message || "Deployment failed"}`);
      pushAI(`Contract deployment failed: ${error.message || "Unknown error occurred"}`);
      
      // Clear error status after 5 seconds
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setDeploying(false);
    }
  };

  // Burn function with pre-defined contract address and 2 USDC
  const handleBurnFromBase = async (contractAddress: string) => {
    if (burning) return; // Prevent multiple clicks
    if (!contractAddress) {
      setStatusMessage("No contract address...");
      return;
    };

    console.log("beginning burn!!!!")
    
    setBurning(true);
    setStatusMessage("Initiating burn transaction...");
    
    try {
      // Pre-defined escrow contract address (you can change this to any valid address)
      const escrowContractAddress = contractAddress as `0x${string}`;
      const amountUSDC = 2; // 2 USDC
      
      setStatusMessage("Confirming the transaction in your wallet...");
      
      // 1) Burn on Base Sepolia (user wallet)
      const result = await burnFromBase({
        escrowContractAddress,
        amountUSDC,
      });
      
      setStatusMessage(`Success! Transaction hash: ${result.txHash}`);
      pushAI(`Burn transaction completed successfully! 2 USDC burned from Base to escrow contract. Transaction: ${result.txHash}. The finalization process will take about 20 minutes to complete automatically.`);
      
      // 2) Finalize on Polygon Amoy (server signer) - Fire and forget, don't block UI
      fetch("/api/contracts/cctp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          txHash: result.txHash,
          expectedMintRecipient: escrowContractAddress
        }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          pushAI(`CCTP finalization completed! The USDC has been successfully transferred to the escrow contract on Polygon Amoy. Details: ${JSON.stringify(data)}`);
        } else {
          const err = await res.json().catch(() => ({}));
          pushAI(`CCTP finalization encountered an issue: ${err.error || "Finalization failed"}. This may resolve automatically or require manual intervention.`);
        }
      }).catch((error) => {
        pushAI(`CCTP finalization error: ${error.message}. This may resolve automatically or require manual intervention.`);
      });

      pushAI(`CCTP finalization completed! The USDC has been successfully transferred to the escrow contract on Polygon Amoy.`);

      // Clear status after 5 seconds
      setTimeout(() => setStatusMessage(null), 5000);
      
    } catch (error: any) {
      console.error("Burn transaction failed:", error);
      setStatusMessage(`Error: ${error.message || "Transaction failed"}`);
      pushAI(`Burn transaction failed: ${error.message || "Unknown error occurred"}`);
      
      // Clear status after 5 seconds
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setBurning(false);
    }
  };

  /** ------- Save consult (wallet-scoped) + Download TXT summary ------- **/
  const endChatAndDownload = () => {
    const fullTxt = summarizeForDoctor(msgs);

    const { symptomsTitle, synopsis, recommendation } = analyzeConsult(msgs);

    const times = msgs.map((m) => m.at).filter((n) => n && n > 0).sort((a, b) => a - b);
    const durationSec =
      times.length >= 2 ? Math.round((times.at(-1)! - times[0]) / 1000) : undefined;

    const consult: Consult = {
      id: crypto.randomUUID(),
      contractAddress,
      symptomsTitle,
      conversationSummary: synopsis,
      recommendation,
      title: symptomsTitle,
      preview: synopsis,
      summary: fullTxt,
      createdAt: Date.now(),
      durationSec,
      messageCount: msgs.length,
    };

    saveConsult(addr, consult);

    const blob = new Blob([fullTxt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `voicedoc-summary-${ts}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    setMsgs([
      {
        id: 'welcome',
        role: 'ai',
        text:
          "Hi, I'm your AI health assistant. Tap the mic, speak naturally, and I'll keep a transcript here.",
        at: 0,
      },
    ])
  };

  function analyzeConsult(allMsgs: Msg[]) {
  const users = allMsgs.filter((m) => m.role === 'user').map((m) => m.text?.trim()).filter((t): t is string => t !== undefined);
    const allUserLower = users.join(' ').toLowerCase();

    const SYMPTOMS = [
      'chest pain','shortness of breath','headache','fever','cough','sore throat',
      'nausea','vomiting','diarrhea','fatigue','rash','dizziness','abdominal pain',
      'stomach pain','back pain','congestion','runny nose','body aches','chills'
    ];
    const found = Array.from(
      new Set(
        SYMPTOMS.filter((s) => allUserLower.includes(s)).map((s) => titleCase(s))
      )
    );

    const durations = matchAll(allUserLower, /\b\d+\s+(?:day|week|month|year)s?\b/g);

    const symptomsTitle =
      found.length ? found.slice(0, 3).join(', ') : (users[0] || 'General symptoms');

    const durationPart = durations.length ? ` for ${durations[0]}` : '';
    const synopsis = `Patient reports ${symptomsTitle.toLowerCase()}${durationPart}. Conversation captured and summarized for review.`;

    const RED_FLAGS = [
      'chest pain','shortness of breath','severe headache','fainted','unconscious',
      'heavy bleeding','vision loss','slurred speech','confusion','stiff neck',
      'high fever'
    ];
    const hasRedFlag = RED_FLAGS.some((k) => allUserLower.includes(k));
    const recommendation: 'doctor' | 'monitor' = hasRedFlag ? 'doctor' : 'monitor';

    return { symptomsTitle, synopsis, recommendation };
  }

  function titleCase(s: string) {
    return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1));
  }

  const fmtTime = (ms: number) =>
    ms > 0 ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now';

  const onPickSlot = (isoLocal: string, raw: { date: string; time: string }) => {
    // 1) Optimistically echo the user's choice into the thread
    setMsgs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        at: Date.now(),
        text: `Let's book ${formatSlotForHuman(raw.date, raw.time)}.`,
      },
    ]);
    setAppointmentDate(dateFromRawLocal(raw))

    setMsgs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'ai',
        at: Date.now(),
        text: `Perfect! Your total for this appointment including insurance will be $2 payable in USDC. Click the button below to securely hold funds until your appointment is completed.`,
      },
    ]);
  };

  function renderMsgBody(m: Msg) {
    if (m.schedule?.length) {
      return (
        <SchedulePicker
          slots={m.schedule}
          onPickSlot={onPickSlot}
          isDisabled={!!appointmentDate}
          className="mt-1"
        />
      );
    }
    return <span>{m.text}</span>;
  }

  //region == RENDER ==
  return (
    <AppShell>
      {/* Hidden widget handles chain tx + callbacks */}
      <div style={{ display: 'none' }}>
        <ChatGPTConsumerWidget
          contractAddress="0x4EA8E8A3dfc7C46a29c655EbD053Dc34c35eA114"
          rpcUrl="https://api.avax-test.network/ext/bc/C/rpc"
          chainId={43113n}
          defaultSubscriptionId={15737n}
          externalQuestion={extQuestion}
          externalSubscriptionId={15737n}
          trigger={cnTrigger}
          onAnswer={(ans) => {
            setThinking(false);
            const id = pendingAiIdRef.current;
            const finalText = ans && ans.trim() ? ans.trim() : '(No answer yet — try Refresh output.)';
            if (id) {
              replaceMsgText(id, finalText);
              pendingAiIdRef.current = null;
            } else {
              // Fallback: push if placeholder is missing
              setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'ai', text: finalText, at: Date.now() }]);
            }
            // Speak the answer
            speak(finalText);

            const triggers = [
              'schedule an appointment',
              'make an appointment',
              'making an appointment',
            ];
            if (triggers.some(p => ans.toLowerCase().includes(p))) {
              console.log("it found it", ans)
              const slots = [
                { date: '2025-08-18', times: ['09:00', '13:00', '15:30'] },
                { date: '2025-08-19', times: ['10:00', '14:00', '16:30'] },
                { date: '2025-08-20', times: ['09:30', '11:00'] },
                { date: '2025-08-21', times: ['09:00', '11:30', '14:00', '16:00'] }
              ];

              setMsgs((m) => [...m, {
                id: crypto.randomUUID(),
                role: 'ai',
                at: Date.now(),
                schedule: slots,
                text: "",
              }]);
            }
          }}
          onError={(err) => {
            setThinking(false);
            const id = pendingAiIdRef.current;
            const text = `(Error) ${err}`;
            if (id) {
              replaceMsgText(id, text);
              pendingAiIdRef.current = null;
            } else {
              setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'ai', text, at: Date.now() }]);
            }
            // Optionally speak errors too
            speak(text);
          }}
          onStatus={(s) => setStatus(s)}
        />
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Heading */}
        <h1 className="text-5xl md:text-6xl font-serif font-bold text-gray-900 text-center leading-tight">
          Hi, I&apos;m <span className="underline decoration-blue-300">VoiceDoc</span>
        </h1>

        <div className="mt-8 space-y-4 text-gray-800 text-lg leading-relaxed">
          <p>I&apos;m your private and personal AI telehealth assistant.</p>
          <p>
            As an AI assistant, my service is fast and free. After we chat, you can book a
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
                ? 'bg-red-50 text-red-600 border-red-200'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
            aria-pressed={listening}
            aria-label={listening ? 'Stop recording' : 'Start recording'}
            title={listening ? 'Stop recording' : 'Start recording'}
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

        {/* helper row with HIPAA + Voice toggle */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" />
            HIPAA compliant &amp; anonymous
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (ttsOn) synthRef.current?.cancel();
                setTtsOn(!ttsOn);
              }}
              className={`px-2 py-1 rounded border ${ttsOn ? 'border-gray-300' : 'border-gray-200 bg-gray-100 text-gray-600'}`}
              title="Toggle spoken responses"
            >
              {ttsOn ? 'Voice: On' : 'Voice: Off'}
            </button>
            {/* Optional tiny picker; keep but hidden by default */}
            {voices.length > 0 && (
              <select
                value={voicePref}
                onChange={(e) => setVoicePref(e.target.value)}
                className="hidden border rounded px-1 py-0.5"
                title="Voice"
              >
                <option value="">Auto</option>
                {voices.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Transcript panel */}
        <div className="mt-8 rounded-2xl border border-[#E8E2D9] bg-[#F6F1E9]">
          {/* status bar */}
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

          {/* scrollable chat */}
          <div ref={scrollRef} className="max-h-[420px] overflow-y-auto p-4 md:p-6 space-y-4">
            {msgs.map((m) => {
              const bubble =
                m.role === 'user'
                  ? 'ml-auto bg-blue-600 text-white'
                  : 'bg-white text-gray-800 border border-[#E8E2D9]';

              return (
                <div key={m.id}>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                    {m.role === 'user' ? 'You' : 'VoiceDoc'} · {fmtTime(m.at)}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl leading-relaxed ${bubble}`}>
                    <div className="px-4 py-3">
                      {renderMsgBody(m)}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* live interim bubble while speaking (unchanged) */}
            {listening && interim && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">You · now</div>
                <div className="max-w-[85%] ml-auto rounded-2xl px-4 py-3 bg-blue-50 text-blue-900 border border-blue-200">
                  {interim}
                </div>
              </div>
            )}
          </div>

          {/* hint bar */}
          <div className="px-4 py-2 border-t border-[#E8E2D9] text-xs text-gray-600">
            Tip: Tap <b>Mic</b>, speak, then tap <b>Mic</b> again to stop. We'll keep a complete
            transcript here.
          </div>
        </div>

        {/* mic status */}
        <div className="mt-3 text-sm">
          <span className={`${listening ? 'text-red-600' : 'text-blue-600'} font-medium`}>
            {status}
          </span>
        </div>

        {/* Contract Address Display */}
        {contractAddress && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
            <div className="font-semibold text-gray-700 mb-2">Latest Deployed Escrow Contract:</div>
            <div className="font-mono text-gray-900 break-all">{contractAddress}</div>
          </div>
        )}

        {/* Actions: Buy + Escrow + Balance */}
        <div className="mt-6 flex flex-col items-center gap-3">

          {/* Current balance directly under the Buy button */}
          <div className="mt-1 text-xs text-gray-700 text-center">
            <div className="mb-1">Current balance</div>
            <div className="flex justify-center">
              <TokenBalanceBadge />
            </div>
          </div>

          {/* Escrow Pay */}
          <button
            onClick={handleEscrowPayment}
            disabled={deploying || !appointmentDate}
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition ${
              deploying || !appointmentDate
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 active:bg-green-800"
            }`}
            title="Pre-pay your appointment for a seamless experience."
          >
            {deploying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Escrow Pay
              </>
            )}
          </button>

          {/* status messages */}
          {statusMessage && (
            <div className={`text-sm px-4 py-2 rounded-lg ${
              statusMessage.includes("Error") 
                ? "bg-red-50 text-red-700 border border-red-200"
                : statusMessage.includes("successfully")
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}>
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** ========= Helper: build a doctor-friendly TXT summary ========= **/
function summarizeForDoctor(allMsgs: Msg[]): string {
  const users = allMsgs.filter((m) => m.role === 'user').map((m) => m.text?.trim()).filter((t): t is string => t !== undefined);
  const ais = allMsgs.filter((m) => m.role === 'ai').map((m) => m.text?.trim()).filter((t): t is string => t !== undefined);
  const allUserText = users.join('\n').toLowerCase();

  const chiefComplaint = users[0] || 'Not provided';

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
    'chest pain',
    'shortness of breath',
    'severe headache',
    'fainted',
    'unconscious',
    'heavy bleeding',
    'vision loss',
    'slurred speech',
    'confusion',
    'stiff neck',
    'high fever',
    'pregnant',
    'suicid',
    'overdose',
  ];
  const redFlags = redFlagsList.filter((k) => allUserText.includes(k));

  const lines = [
    'VoiceDoc — Visit Summary (Auto-generated)',
    `Date: ${new Date().toLocaleString()}`,
    '',
    'Patient:',
    '  • Anonymous (no identity collected in this session)',
    '',
    'Chief Complaint:',
    `  • ${chiefComplaint}`,
    '',
    'Symptom Summary (patient statements):',
    ...(users.length ? users.map((u) => `  • ${u}`) : ['  • Not provided']),
    '',
    'Onset / Duration (parsed):',
    `  • Phrases: ${onset.length ? onset.join('; ') : '—'}`,
    `  • Durations: ${durations.length ? durations.join('; ') : '—'}`,
    '',
    'Medications Mentioned:',
    ...(meds.length ? meds.map((m) => `  • ${m}`) : ['  • —']),
    '',
    'Allergies Mentioned:',
    ...(allergies.length ? allergies.map((m) => `  • ${m}`) : ['  • —']),
    '',
    'Relevant History (self-reported):',
    ...(history.length ? history.map((m) => `  • ${m}`) : ['  • —']),
    '',
    'Home Measurements / Vitals Mentioned:',
    ...(vitals.length ? vitals.map((m) => `  • ${m}`) : ['  • —']),
    '',
    'Potential Red Flags (keyword scan):',
    `  • ${redFlags.length ? redFlags.join(', ') : 'None detected based on keywords'}`,
    '',
    'AI Guidance Given (high-level):',
    ...(ais.length ? ais.map((a) => `  • ${a}`) : ['  • —']),
    '',
    'Next Steps Discussed:',
    '  • —',
    '',
    'Disclaimer:',
    '  • This summary is auto-generated for clinical review and is not medical advice.',
  ];

  return lines.join('\n');
}

function matchAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(text))) out.push(m[0]);
  return out;
}
