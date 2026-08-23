'use client';

// /src/app/(desktop)/layout.tsx
// SmartStock Experience V1 — Operational Desktop Shell

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useNavItems } from '@/hooks/useNavItems';
import { ToastProvider } from '@/hooks/useToast';
import { StoreSelector } from '@/components/domain/StoreSelector';
import { SearchModal } from '@/components/ui/SearchModal';
import { Search, Bell, SlidersHorizontal, User } from 'lucide-react';

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, setRole, density, setDensity, tenantId } = useStoreContext();
  const navItems = useNavItems(role);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ToastProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#F7F8FA] text-[#101828] font-sans antialiased">
        {/* ── LEFT PERSISTENT SIDEBAR (200px) ── */}
        <aside className="w-52 flex-shrink-0 bg-white border-r border-[#E4E7EC] flex flex-col justify-between p-3.5 h-full z-20 select-none">
          <div className="space-y-4">
            {/* Wordmark Header */}
            <div className="px-2.5 py-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-[5px] bg-[#14706B] flex items-center justify-center text-white font-bold text-xs shadow-2xs">
                  S
                </div>
                <span className="text-sm font-semibold tracking-tight text-[#101828]">SmartStock</span>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="space-y-0.5 pt-1">
              {navItems.map(({ label, href, icon: Icon, badge, badgeType }) => {
                const active = pathname === href || (href !== '/home' && pathname.startsWith(href));

                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-[6px] text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[#E8F4F3] text-[#14706B] font-semibold border-l-2 border-[#14706B]'
                        : 'text-[#475467] hover:bg-[#F9FAFB] hover:text-[#101828]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${active ? 'text-[#14706B]' : 'text-[#667085]'}`} />
                      <span>{label}</span>
                    </div>

                    {badge && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-[4px] font-medium ${
                          badgeType === 'critical'
                            ? 'bg-[#FEF3F2] text-[#D92D20] border border-[#FECDCA]'
                            : 'bg-[#F2F4F7] text-[#475467]'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Footer Environment Info & Role Switcher */}
          <div className="p-2.5 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-2 text-[11px]">
            <div className="flex items-center justify-between text-[#667085]">
              <span>Role View</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="bg-white border border-[#D0D5DD] text-[10px] rounded px-1 py-0.5 text-[#101828] cursor-pointer"
              >
                <option value="store_manager">Store Manager</option>
                <option value="regional_manager">Regional Manager</option>
                <option value="supply_chain">Supply Chain</option>
                <option value="integration_admin">Integration Admin</option>
                <option value="system_admin">System Admin</option>
              </select>
            </div>
            <div className="flex items-center justify-between text-[#98A2B3] text-[10px]">
              <span>Tenant</span>
              <span className="font-mono">{tenantId || 'default'}</span>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT AREA ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F7F8FA]">
          {/* Top Header Bar (56px) */}
          <header className="h-14 bg-white border-b border-[#E4E7EC] px-6 flex items-center justify-between flex-shrink-0 z-10">
            <div className="flex items-center gap-4">
              <StoreSelector />

              {/* Global Cmd+K Search Bar */}
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[#F9FAFB] hover:bg-[#F2F4F7] border border-[#D0D5DD] text-xs text-[#667085] transition-colors"
              >
                <Search className="w-3.5 h-3.5 text-[#98A2B3]" />
                <span className="hidden sm:inline">Search SKU, actions, docs...</span>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#D0D5DD] text-[#475467]">
                  ⌘K
                </kbd>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Density Mode Toggle */}
              <button
                onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
                className="p-1.5 rounded-[6px] text-[#667085] hover:text-[#101828] hover:bg-[#F2F4F7] transition-colors"
                title={`Density: ${density}`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {/* Notification Alerts */}
              <button
                className="relative p-1.5 rounded-[6px] text-[#667085] hover:text-[#101828] hover:bg-[#F2F4F7] transition-colors"
                aria-label="Alerts"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute 1 top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#D92D20]" />
              </button>

              {/* User Avatar */}
              <div className="flex items-center gap-2 pl-2 border-l border-[#E4E7EC]">
                <div className="w-7 h-7 rounded-full bg-[#E8F4F3] border border-[#14706B]/20 text-[#14706B] flex items-center justify-center font-semibold text-xs">
                  SM
                </div>
              </div>
            </div>
          </header>

          {/* Dynamic Page Workspace */}
          <main className="flex-1 overflow-y-auto p-6 bg-[#F7F8FA]">
            <div className="max-w-7xl mx-auto space-y-6">{children}</div>
          </main>
        </div>

        {/* Global Search Modal */}
        <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </ToastProvider>
  );
}
