'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import {
  Pill, ClipboardList, Calendar, Clock, Edit3, Trash2, Plus, Info, User, Building2, ShieldCheck
} from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { normalizeAddr } from '../lib/consults';
import {
  type CurrentMed, type ActiveRx, type MedsRecord,
  loadMeds, addCurrentMed, updateCurrentMed, deleteCurrentMed,
  addRx, updateRx, deleteRx
} from '../lib/meds';

export default function MedsPage() {
  const evmAddrRaw: any = useEvmAddress();
  const addr = normalizeAddr(evmAddrRaw);

  const [data, setData] = useState<MedsRecord>({ current: [], prescriptions: [], updatedAt: Date.now() });
  const [editingMed, setEditingMed] = useState<CurrentMed | null>(null);
  const [editingRx, setEditingRx] = useState<ActiveRx | null>(null);
  const [showMedForm, setShowMedForm] = useState(false);
  const [showRxForm, setShowRxForm] = useState(false);

  useEffect(() => { setData(loadMeds(addr)); }, [addr]);

  const upsertMed = (v: Partial<CurrentMed>) => {
    const med: CurrentMed = {
      id: v.id || crypto.randomUUID(),
      name: (v.name||'').trim(),
      dose: (v.dose||'').trim(),
      route: v.route?.trim(),
      frequency: v.frequency?.trim(),
      startedAt: v.startedAt || '',
      notes: v.notes?.trim(),
    };
    if (!med.name || !med.dose) return;
    setData((editingMed ? updateCurrentMed : addCurrentMed)(addr, med));
    setEditingMed(null); setShowMedForm(false);
  };

  const upsertRx = (v: Partial<ActiveRx>) => {
    const rx: ActiveRx = {
      id: v.id || crypto.randomUUID(),
      drug: (v.drug||'').trim(),
      dose: (v.dose||'').trim(),
      sig: v.sig?.trim(),
      startedAt: v.startedAt || '',
      expiresAt: v.expiresAt || '',
      prescriber: v.prescriber?.trim(),
      pharmacy: v.pharmacy?.trim(),
      notes: v.notes?.trim(),
    };
    if (!rx.drug || !rx.dose) return;
    setData((editingRx ? updateRx : addRx)(addr, rx));
    setEditingRx(null); setShowRxForm(false);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900">Medications</h1>
            <p className="text-gray-600 mt-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Wallet-scoped
            </p>
          </div>
          <div className="hidden md:flex gap-3">
            <button onClick={()=>{setEditingMed(null);setShowMedForm(true);}}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2">
              <Plus className="w-4 h-4" /> Add Current Med
            </button>
            <button onClick={()=>{setEditingRx(null);setShowRxForm(true);}}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2">
              <Plus className="w-4 h-4" /> Add Prescription
            </button>
          </div>
        </div>

        <div className="md:hidden mt-4 grid grid-cols-2 gap-3">
          <button onClick={()=>{setEditingMed(null);setShowMedForm(true);}}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-3">
            <Plus className="w-4 h-4" /> Current Med
          </button>
          <button onClick={()=>{setEditingRx(null);setShowRxForm(true);}}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-3">
            <Plus className="w-4 h-4" /> Prescription
          </button>
        </div>

        <div className="mt-8 grid md:grid-cols-2 gap-6">
          {/* Current Meds */}
          <section className="rounded-2xl border border-[#E8E2D9] bg-white shadow-sm">
            <header className="flex items-center justify-between px-5 py-4 border-b border-[#E8E2D9]">
              <div className="flex items-center gap-3">
                <Pill className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Current Medications</h2>
              </div>
              <button onClick={()=>{setEditingMed(null);setShowMedForm(true);}}
                className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-900">
                <Plus className="w-4 h-4" /> Add
              </button>
            </header>

            {data.current.length === 0 ? (
              <EmptyState title="No current meds yet" subtitle="Track vitamins, OTC meds, or ongoing prescriptions you're actively taking." />
            ) : (
              <ul className="divide-y divide-[#F0EAE1]">
                {data.current.map(m=>(
                  <li key={m.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-gray-900">{m.name}</span>
                          <span className="text-sm text-gray-500">· {m.dose}</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700 flex flex-wrap gap-x-4 gap-y-1">
                          {m.route && <Badge icon={<ClipboardList className="w-3.5 h-3.5" />} label={m.route} />}
                          {m.frequency && <Badge icon={<Clock className="w-3.5 h-3.5" />} label={m.frequency} />}
                          {m.startedAt && <Badge icon={<Calendar className="w-3.5 h-3.5" />} label={`Start ${m.startedAt}`} />}
                        </div>
                        {m.notes && <p className="mt-2 text-sm text-gray-600 flex items-start gap-2"><Info className="w-4 h-4 mt-0.5" /> {m.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <IconBtn title="Edit" onClick={()=>{setEditingMed(m);setShowMedForm(true);}} className="text-gray-700 hover:text-gray-900"><Edit3 className="w-4 h-4"/></IconBtn>
                        <IconBtn title="Delete" onClick={()=>setData(deleteCurrentMed(addr, m.id))} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4"/></IconBtn>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Active Prescriptions */}
          <section className="rounded-2xl border border-[#E8E2D9] bg-white shadow-sm">
            <header className="flex items-center justify-between px-5 py-4 border-b border-[#E8E2D9]">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-emerald-600" />
                <h2 className="text-xl font-semibold text-gray-900">Active Prescriptions</h2>
              </div>
              <button onClick={()=>{setEditingRx(null);setShowRxForm(true);}}
                className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-900">
                <Plus className="w-4 h-4" /> Add
              </button>
            </header>

            {data.prescriptions.length === 0 ? (
              <EmptyState title="No active prescriptions" subtitle="Add your current prescriptions so we can help you track them." />
            ) : (
              <ul className="divide-y divide-[#F0EAE1]">
                {data.prescriptions.map(r=>(
                  <li key={r.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-gray-900">{r.drug}</span>
                          <span className="text-sm text-gray-500">· {r.dose}</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-700 flex flex-wrap gap-x-4 gap-y-1">
                          {r.sig && <Badge icon={<ClipboardList className="w-3.5 h-3.5" />} label={r.sig} />}
                          {r.startedAt && <Badge icon={<Calendar className="w-3.5 h-3.5" />} label={`Start ${r.startedAt}`} />}
                          {r.expiresAt && <Badge icon={<Calendar className="w-3.5 h-3.5" />} label={`Expires ${r.expiresAt}`} />}
                          {r.prescriber && <Badge icon={<User className="w-3.5 h-3.5" />} label={r.prescriber} />}
                          {r.pharmacy && <Badge icon={<Building2 className="w-3.5 h-3.5" />} label={r.pharmacy} />}
                        </div>
                        {r.notes && <p className="mt-2 text-sm text-gray-600 flex items-start gap-2"><Info className="w-4 h-4 mt-0.5" /> {r.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <IconBtn title="Edit" onClick={()=>{setEditingRx(r);setShowRxForm(true);}} className="text-gray-700 hover:text-gray-900"><Edit3 className="w-4 h-4"/></IconBtn>
                        <IconBtn title="Delete" onClick={()=>setData(deleteRx(addr, r.id))} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4"/></IconBtn>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Forms */}
        {showMedForm && (
          <MedForm
            initial={editingMed ?? undefined}
            onCancel={()=>{setShowMedForm(false);setEditingMed(null);}}
            onSave={(v)=>upsertMed({ ...(editingMed ?? {}), ...v })}
          />
        )}
        {showRxForm && (
          <RxForm
            initial={editingRx ?? undefined}
            onCancel={()=>{setShowRxForm(false);setEditingRx(null);}}
            onSave={(v)=>upsertRx({ ...(editingRx ?? {}), ...v })}
          />
        )}
      </div>
    </AppShell>
  );
}

/* UI helpers */
function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="p-8 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#F6F1E9] text-gray-700">
        <Info className="w-5 h-5" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
    </div>
  );
}
function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
      {icon}{label}
    </span>
  );
}
function IconBtn({ children, title, onClick, className='' }:
  React.PropsWithChildren<{ title: string; onClick: () => void; className?: string }>) {
  return (
    <button type="button" title={title} aria-label={title}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 py-2 shadow-sm ${className}`}>
      {children}
    </button>
  );
}

/* Forms (compact) */
function Field({ label, value, onChange, placeholder, type='text', className='' }:{
  label:string; value:string; onChange:(v:string)=>void; placeholder?:string; type?:string; className?:string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm text-gray-700 mb-1">{label}</span>
      <input value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} type={type}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200" />
    </label>
  );
}
function MedForm({ initial, onCancel, onSave }:{
  initial?: Partial<CurrentMed>; onCancel:()=>void; onSave:(v:Partial<CurrentMed>)=>void;
}) {
  const [name,setName]=useState(initial?.name??'');
  const [dose,setDose]=useState(initial?.dose??'');
  const [route,setRoute]=useState(initial?.route??'');
  const [frequency,setFrequency]=useState(initial?.frequency??'');
  const [startedAt,setStartedAt]=useState(initial?.startedAt??'');
  const [notes,setNotes]=useState(initial?.notes??'');
  const valid = name.trim() && dose.trim();
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-end md:items-center justify-center z-40">
      <div className="w-full md:w-[560px] rounded-2xl bg-white shadow-xl border border-[#E8E2D9] p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Current Medication</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-800">Close</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <Field label="Name" value={name} onChange={setName} placeholder="Metformin" />
          <Field label="Dose" value={dose} onChange={setDose} placeholder="500 mg" />
          <Field label="Route" value={route} onChange={setRoute} placeholder="oral" />
          <Field label="Frequency" value={frequency} onChange={setFrequency} placeholder="BID" />
          <Field label="Start Date" value={startedAt} onChange={setStartedAt} type="date" />
          <Field label="Notes" value={notes} onChange={setNotes} placeholder="take with food" className="md:col-span-2" />
        </div>
        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onCancel} className="rounded-xl border border-gray-200 bg-white px-4 py-2">Cancel</button>
          <button onClick={()=>valid && onSave({ id: initial?.id, name, dose, route, frequency, startedAt, notes })}
            disabled={!valid}
            className="rounded-xl bg-blue-600 text-white px-4 py-2 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
function RxForm({ initial, onCancel, onSave }:{
  initial?: Partial<ActiveRx>; onCancel:()=>void; onSave:(v:Partial<ActiveRx>)=>void;
}) {
  const [drug,setDrug]=useState(initial?.drug??'');
  const [dose,setDose]=useState(initial?.dose??'');
  const [sig,setSig]=useState(initial?.sig??'');
  const [startedAt,setStartedAt]=useState(initial?.startedAt??'');
  const [expiresAt,setExpiresAt]=useState(initial?.expiresAt??'');
  const [prescriber,setPrescriber]=useState(initial?.prescriber??'');
  const [pharmacy,setPharmacy]=useState(initial?.pharmacy??'');
  const [notes,setNotes]=useState(initial?.notes??'');
  const valid = drug.trim() && dose.trim();
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-end md:items-center justify-center z-40">
      <div className="w-full md:w-[640px] rounded-2xl bg-white shadow-xl border border-[#E8E2D9] p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Prescription</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-800">Close</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <Field label="Drug" value={drug} onChange={setDrug} placeholder="Amoxicillin" />
          <Field label="Dose" value={dose} onChange={setDose} placeholder="500 mg" />
          <Field label="SIG / Instructions" value={sig} onChange={setSig} placeholder="1 tab PO TID x 7 days" className="md:col-span-2" />
          <Field label="Start Date" value={startedAt} onChange={setStartedAt} type="date" />
          <Field label="Expiry Date" value={expiresAt} onChange={setExpiresAt} type="date" />
          <Field label="Prescriber" value={prescriber} onChange={setPrescriber} placeholder="Dr. Smith" />
          <Field label="Pharmacy" value={pharmacy} onChange={setPharmacy} placeholder="CVS #1234" />
          <Field label="Notes" value={notes} onChange={setNotes} placeholder="avoid alcohol" className="md:col-span-2" />
        </div>
        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onCancel} className="rounded-xl border border-gray-200 bg-white px-4 py-2">Cancel</button>
          <button onClick={()=>valid && onSave({ id: initial?.id, drug, dose, sig, startedAt, expiresAt, prescriber, pharmacy, notes })}
            disabled={!valid}
            className="rounded-xl bg-emerald-600 text-white px-4 py-2 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
