'use client';

import React from 'react';
import AppShell from '../components/AppShell';
import { FileText, Activity, Heart, Weight, Thermometer } from 'lucide-react';
import { useIsSignedIn, useEvmAddress } from '@coinbase/cdp-hooks';
import { AuthButton } from '@coinbase/cdp-react/components/AuthButton';

type RecordItem = {
  id: string;
  dateISO: string;
  title: string;
  subtitle?: string;
  notes?: string;
  vitals?: { bp?: string; hr?: string; weight?: string; temp?: string };
};

const DEMO_RECORD: RecordItem = {
  id: 'demo-1',
  dateISO: new Date().toISOString(),
  title: 'Visit Summary',
  subtitle: 'Auto-generated from conversation',
  notes:
    'Chief complaint: Example — headache and fatigue for 3 days.\n' +
    'Symptom summary: Dull headache, worse in afternoon; mild fatigue; no fever.\n' +
    'Medications mentioned: None.\n' +
    'Allergies: None known.\n' +
    'Plan: Hydration, rest, OTC analgesic as needed, follow-up if symptoms persist or worsen.',
  vitals: { bp: '120/80 mmHg', hr: '72 bpm', weight: '165 lbs', temp: '98.6°F' },
};

function useNormalizedAddress(): string | undefined {
  // CDP hooks can return a string or an object depending on SDK version
  const raw: any = useEvmAddress?.();
  const addr: string | undefined =
    typeof raw === 'string' ? raw : raw?.evmAddress ?? undefined;
  return addr?.toLowerCase();
}

export default function HealthRecordPage() {
  const { isSignedIn } = useIsSignedIn();
  const addr = useNormalizedAddress();
  const allowed = (process.env.NEXT_PUBLIC_ALLOWED_WALLET || '').toLowerCase();
  const canView = Boolean(isSignedIn && addr && allowed && addr === allowed);

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Health Record</h1>
            <p className="text-gray-600">Your personal health information and medical history</p>
          </div>
          {/* Sign in / out control */}
          <div className="ml-4">
            <AuthButton />
          </div>
        </div>

        {/* Wallet tag */}
        <div className="mb-6 text-sm text-gray-600">
          {addr ? (
            <>
              Wallet:&nbsp;
              <span className="font-mono">
                {addr.slice(0, 6)}…{addr.slice(-4)}
              </span>
            </>
          ) : (
            <>Not signed in</>
          )}
        </div>

        {!isSignedIn && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Log in to view your medical records</h2>
            <p className="text-gray-600">
              Records are tied to your Coinbase embedded wallet. Sign in to see your data.
            </p>
          </div>
        )}

        {isSignedIn && !canView && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-6">
            <p className="font-medium">No records for this account.</p>
            <p className="text-sm mt-1">
              Switch to your authorized account to view records.
            </p>
          </div>
        )}

        {canView && (
          <>
            {/* Vitals snapshot (from demo record) */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Latest Vital Signs</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <VitalCard icon={Heart} label="Blood Pressure" value={DEMO_RECORD.vitals?.bp || '—'} />
                <VitalCard icon={Activity} label="Heart Rate" value={DEMO_RECORD.vitals?.hr || '—'} />
                <VitalCard icon={Weight} label="Weight" value={DEMO_RECORD.vitals?.weight || '—'} />
                <VitalCard icon={Thermometer} label="Temperature" value={DEMO_RECORD.vitals?.temp || '—'} />
              </div>
            </div>

            {/* Single demo record (only when wallet matches the allowlist) */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Medical History</h2>
              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-medium text-gray-900">
                    {DEMO_RECORD.title}{' '}
                    <span className="text-sm text-gray-500">
                      — {new Date(DEMO_RECORD.dateISO).toLocaleDateString()}
                    </span>
                  </h3>
                  {DEMO_RECORD.subtitle && (
                    <p className="text-sm text-gray-600 mt-1">{DEMO_RECORD.subtitle}</p>
                  )}
                  {DEMO_RECORD.notes && (
                    <p className="text-gray-700 whitespace-pre-wrap mt-2">{DEMO_RECORD.notes}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function VitalCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
}) {
  return (
    <div className="text-center p-4 bg-gray-50 rounded-lg">
      <Icon className="w-8 h-8 text-blue-600 mx-auto mb-3" />
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-600 mb-2">{label}</div>
    </div>
  );
}
