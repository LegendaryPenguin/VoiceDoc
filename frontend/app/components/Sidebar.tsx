'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageCircle,
  History,
  FileText,
  Pill,
  TestTube,
  Calendar,
  Activity,
  X,
} from 'lucide-react';

// CDP auth button (unchanged)
import { AuthButton } from '@coinbase/cdp-react/components/AuthButton';

// ✅ Wallet-scoped badge support
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { normalizeAddr } from '../lib/consults';
import { loadMeds } from '../lib/meds';

export default function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // --- Wallet + meds count
  const evmAddrRaw: any = useEvmAddress();
  const addr = normalizeAddr(evmAddrRaw);
  const [rxCount, setRxCount] = useState<number>(0);

  useEffect(() => {
    try {
      const rec = loadMeds(addr);
      setRxCount(rec.prescriptions?.length || 0);
    } catch {
      setRxCount(0);
    }
    // Recalc on route change so if user edits meds, the badge refreshes on nav
  }, [addr, pathname]);

  const items: {
    href: string;
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    badge?: number;
  }[] = [
    { href: '/', label: 'New Consult', icon: MessageCircle },
    { href: '/consults', label: 'Consults', icon: History },
    { href: '/health-record', label: 'Health Record', icon: FileText },
    { href: '/meds', label: 'Meds', icon: Pill, badge: rxCount }, // 👈 badge
    { href: '/labs', label: 'Labs', icon: TestTube },
    { href: '/appointments', label: 'Appointments', icon: Calendar },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-80 bg-white shadow-xl border-r border-gray-200 z-50 transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="p-6 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-blue-600">VoiceDoc</span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Menu */}
          <nav className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              // Better active-state: exact or section root (e.g., /meds/settings)
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={onClose}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </span>

                  {/* Only show badge if > 0 */}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-3 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs px-2 py-0.5">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* CTA -> CDP AuthButton */}
          <div className="mt-8">
            <AuthButton className="w-full" />
          </div>
        </div>
      </aside>
    </>
  );
}
