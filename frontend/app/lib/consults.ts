'use client';

export type Consult = {
  id: string;
  contractAddress?: string; // unique contract generated upon booking an appointment

  // NEW:
  symptomsTitle: string;              // title on card
  conversationSummary: string;        // description on card
  recommendation: "doctor" | "monitor";

  // Existing/legacy (kept for backward compatibility / download):
  title?: string;
  preview?: string;
  summary?: string;

  createdAt: number;
  durationSec?: number;
  messageCount: number;
};


export function normalizeAddr(maybe:
  string | { evmAddress?: string } | undefined | null
): string | undefined {
  if (!maybe) return undefined;
  if (typeof maybe === 'string') return maybe.toLowerCase();
  if (typeof maybe === 'object' && maybe.evmAddress)
    return String(maybe.evmAddress).toLowerCase();
  return undefined;
}

function keyFor(addr?: string) {
  return addr ? `voicedoc:consults:${addr}` : 'voicedoc:consults:guest';
}

export function loadConsults(addr?: string): Consult[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(keyFor(addr));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Consult[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveConsult(addr: string | undefined, c: Consult) {
  if (typeof window === 'undefined') return;
  const k = keyFor(addr);
  const list = loadConsults(addr);
  list.unshift(c); // newest first
  localStorage.setItem(k, JSON.stringify(list));
}
