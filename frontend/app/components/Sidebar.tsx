'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageCircle,
  History,
  FileText,
  Pill,
  TestTube, // if you get an icon error, switch to TestTube2
  Calendar,
  Activity,
  X,
} from 'lucide-react';

export default function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // No "comingSoon" flags anymore
  const items = [
    { href: '/', label: 'New Consult', icon: MessageCircle },
    { href: '/consults', label: 'Consults', icon: History },
    { href: '/health-record', label: 'Health Record', icon: FileText },
    { href: '/meds', label: 'Meds', icon: Pill },
    { href: '/labs', label: 'Labs', icon: TestTube },
    { href: '/appointments', label: 'Appointments', icon: Calendar },
  ];

  return (
    <>
      {/* Overlay (always, not just on mobile) */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      )}

      {/* Off-canvas sidebar (never pinned open) */}
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
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={onClose}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* CTA (keep, nothing below it) */}
          <div className="mt-8">
            <button className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-700 transition">
              Join now free
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
