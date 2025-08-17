// app/lib/meds.ts
'use client';

export type MedId = string;

export type CurrentMed = {
  id: MedId;
  name: string;
  dose: string;           // e.g. "10 mg"
  route?: string;         // e.g. "oral"
  frequency?: string;     // e.g. "once daily"
  startedAt?: string;     // ISO date (YYYY-MM-DD)
  notes?: string;
};

export type ActiveRx = {
  id: MedId;
  drug: string;
  dose: string;           // e.g. "5 mg"
  sig?: string;           // e.g. "1 tab PO BID"
  startedAt?: string;     // ISO date
  expiresAt?: string;     // ISO date
  prescriber?: string;
  pharmacy?: string;
  notes?: string;
};

export type MedsRecord = {
  current: CurrentMed[];
  prescriptions: ActiveRx[];
  updatedAt: number;
};

function keyFor(addr?: string | null) {
  return `voicedoc:meds:${addr ?? 'guest'}`;
}

export function loadMeds(addr?: string | null): MedsRecord {
  if (typeof window === 'undefined') {
    return { current: [], prescriptions: [], updatedAt: Date.now() };
  }
  try {
    const raw = localStorage.getItem(keyFor(addr));
    if (!raw) return { current: [], prescriptions: [], updatedAt: Date.now() };
    const parsed = JSON.parse(raw) as MedsRecord;
    if (!parsed.current) parsed.current = [];
    if (!parsed.prescriptions) parsed.prescriptions = [];
    return parsed;
  } catch {
    return { current: [], prescriptions: [], updatedAt: Date.now() };
  }
}

export function saveMeds(addr: string | null | undefined, data: MedsRecord) {
  if (typeof window === 'undefined') return;
  const rec: MedsRecord = { ...data, updatedAt: Date.now() };
  localStorage.setItem(keyFor(addr), JSON.stringify(rec));
}

export function addCurrentMed(addr: string | null | undefined, med: CurrentMed) {
  const rec = loadMeds(addr);
  rec.current = [{ ...med, id: med.id || crypto.randomUUID() }, ...rec.current];
  saveMeds(addr, rec);
  return rec;
}

export function updateCurrentMed(addr: string | null | undefined, med: CurrentMed) {
  const rec = loadMeds(addr);
  rec.current = rec.current.map(m => (m.id === med.id ? med : m));
  saveMeds(addr, rec);
  return rec;
}

export function deleteCurrentMed(addr: string | null | undefined, id: string) {
  const rec = loadMeds(addr);
  rec.current = rec.current.filter(m => m.id !== id);
  saveMeds(addr, rec);
  return rec;
}

export function addRx(addr: string | null | undefined, rx: ActiveRx) {
  const rec = loadMeds(addr);
  rec.prescriptions = [{ ...rx, id: rx.id || crypto.randomUUID() }, ...rec.prescriptions];
  saveMeds(addr, rec);
  return rec;
}

export function updateRx(addr: string | null | undefined, rx: ActiveRx) {
  const rec = loadMeds(addr);
  rec.prescriptions = rec.prescriptions.map(r => (r.id === rx.id ? rx : r));
  saveMeds(addr, rec);
  return rec;
}

export function deleteRx(addr: string | null | undefined, id: string) {
  const rec = loadMeds(addr);
  rec.prescriptions = rec.prescriptions.filter(r => r.id !== id);
  saveMeds(addr, rec);
  return rec;
}
