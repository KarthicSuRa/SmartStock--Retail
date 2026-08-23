'use client';

// /src/app/(desktop)/layout.tsx
// SmartStock Experience — Operational Desktop Shell with Functional Header Actions

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useNavItems } from '@/hooks/useNavItems';
import { ToastProvider } from '@/hooks/useToast';
import { StoreSelector } from '@/components/domain/StoreSelector';
import { SearchModal } from '@/components/ui/SearchModal';
import { supabase } from '@/lib/supabase';
import {
  Search,
  Bell,
  SlidersHorizontal,
  User,
  LogOut,
  ShieldCheck,
  AlertCircle,
  Clock,
  Zap,
  Check,
  ExternalLink,
  ChevronRight,
  Sparkles
} from 'lucide-react';

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, setRole, density, setDensity, tenantId, activeStoreId } = useStoreContext();
  const navItems = useNavItems(role);

  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cmd+K global shortcut
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

  const [notifications, setNotifications] = useState([
    {
      id: 'n-01',
      title: 'Critical Stockout Imminent',
      description: 'AirPods Pro (USB-C) at Store 1001 expected runout in 2h 18m.',
      time: '3 min ago',
      type: 'critical',
      href: '/actions',
    },
    {
      id: 'n-02',
      title: 'FEFO Expiry Action Required',
      description: 'Organic Fresh Whole Milk 2L (14 units) expires in 24 hours.',
      time: '18 min ago',
      type: 'warning',
      href: '/fefo',
    },
    {
      id: 'n-03',
      title: 'SAP S/4HANA Batch Synced',
      description: 'Idempotent Outbox Batch #892 (24 items) posted cleanly.',
      time: '42 min ago',
      type: 'healthy',
      href: '/admin/pos-control-tower',
    },
  ]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    router.push('/login');
  };

  return (
    <ToastProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#F7F8FA] text-[#101828] font-sans antialiased">
        
        {/* ── LEFT PERSISTENT SIDEBAR ── */}
        <aside className="w-56 flex-shrink-0 bg-white border-r border-[#E4E7EC] flex flex-col justify-between p-3.5 h-full z-20 select-none">
          <div className="space-y-4">
            {/* Wordmark Header */}
            <Link href="/" className="px-2.5 py-1 flex items-center justify-between group">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#14706B] to-emerald-600 flex items-center justify-center text-white font-black text-xs shadow-xs">
                  SS
                </div>
                <div>
                  <span className="text-sm font-bold tracking-tight text-[#101828] group-hover:text-[#14706B] transition-colors">
                    SmartStock
                  </span>
                  <span className="text-[9px] block text-[#667085] font-mono uppercase">LiveRetail PRO</span>
                </div>
              </div>
            </Link>

            {/* Navigation Links */}
            <nav className="space-y-0.5 pt-1 overflow-y-auto max-h-[calc(100vh-230px)]">
              {navItems.map(({ label, href, icon: Icon, badge, badgeType }) => {
                const active = pathname === href || (href !== '/home' && href !== '/' && pathname.startsWith(href));

                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-[6px] text-xs font-medium transition-all ${
                      active
                        ? 'bg-[#E8F4F3] text-[#14706B] font-bold border-l-3 border-[#14706B]'
                        : 'text-[#475467] hover:bg-[#F9FAFB] hover:text-[#101828]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#14706B]' : 'text-[#667085]'}`} />
                      <span className="truncate">{label}</span>
                    </div>

                    {badge && (
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                          badgeType === 'critical'
                            ? 'bg-[#FEF3F2] text-[#D92D20] border border-[#FECDCA]'
                            : badgeType === 'healthy'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
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
          <div className="p-2.5 rounded-xl bg-[#F9FAFB] border border-[#EAECF0] space-y-2 text-[11px]">
            <div className="flex items-center justify-between text-[#667085]">
              <span className="font-semibold">Active Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="bg-white border border-[#D0D5DD] text-[10px] font-bold rounded px-1.5 py-0.5 text-[#101828] cursor-pointer"
              >
                <option value="store_manager">Store Manager</option>
                <option value="floor_worker">Floor Staff</option>
                <option value="regional_manager">Regional Manager</option>
                <option value="supply_chain">Supply Chain</option>
                <option value="integration_admin">Integration Admin</option>
                <option value="system_admin">System Admin</option>
              </select>
            </div>
            <div className="flex items-center justify-between text-[#98A2B3] text-[10px] font-mono">
              <span>Tenant</span>
              <span>{tenantId || 'default-tenant'}</span>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT AREA ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F7F8FA]">
          {/* Top Header Bar */}
          <header className="h-14 bg-white border-b border-[#E4E7EC] px-6 flex items-center justify-between flex-shrink-0 z-30">
            <div className="flex items-center gap-4">
              <StoreSelector />

              {/* Global Cmd+K Search Bar */}
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F9FAFB] hover:bg-[#F2F4F7] border border-[#D0D5DD] text-xs text-[#667085] transition-colors"
              >
                <Search className="w-3.5 h-3.5 text-[#98A2B3]" />
                <span className="hidden sm:inline">Search SKU, actions, docs...</span>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#D0D5DD] text-[#475467]">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Header Right Action Items */}
            <div className="flex items-center gap-3">
              
              {/* Density Mode Toggle */}
              <button
                onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
                className="p-2 rounded-lg text-[#667085] hover:text-[#101828] hover:bg-[#F2F4F7] transition-all relative group"
                title={`Toggle table row density (Currently: ${density})`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="sr-only">Toggle Density</span>
              </button>

              {/* Notification Alerts Dropdown */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className={`p-2 rounded-lg transition-all relative ${
                    notificationsOpen ? 'bg-[#E8F4F3] text-[#14706B]' : 'text-[#667085] hover:text-[#101828] hover:bg-[#F2F4F7]'
                  }`}
                  aria-label="Alerts"
                >
                  <Bell className="w-4 h-4" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#D92D20] ring-2 ring-white" />
                  )}
                </button>

                {/* Notifications Popover */}
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-3.5 bg-slate-50 border-b border-[#EAECF0] flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-[#101828]">
                        <Bell className="w-3.5 h-3.5 text-[#14706B]" />
                        <span>Live Operational Alerts ({notifications.length})</span>
                      </div>
                      <button
                        onClick={() => setNotifications([])}
                        className="text-[10px] text-[#14706B] hover:underline font-semibold"
                      >
                        Clear all
                      </button>
                    </div>

                    <div className="divide-y divide-[#EAECF0] max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-xs text-[#667085]">
                          <Check className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                          <span>All operational alerts resolved</span>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <Link
                            key={n.id}
                            href={n.href}
                            onClick={() => setNotificationsOpen(false)}
                            className="p-3.5 hover:bg-[#F9FAFB] block transition-colors space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-[#101828] flex items-center gap-1.5">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    n.type === 'critical' ? 'bg-[#D92D20]' : n.type === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                />
                                {n.title}
                              </span>
                              <span className="text-[10px] text-[#98A2B3] font-mono">{n.time}</span>
                            </div>
                            <p className="text-xs text-[#475467] leading-relaxed">{n.description}</p>
                          </Link>
                        ))
                      )}
                    </div>

                    <div className="p-2.5 bg-slate-50 border-t border-[#EAECF0] text-center">
                      <Link
                        href="/actions"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs font-bold text-[#14706B] hover:underline inline-flex items-center gap-1"
                      >
                        <span>Open Action Command Matrix</span>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* User Profile & Session Dropdown */}
              <div className="relative pl-2 border-l border-[#E4E7EC]" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-[#14706B]/30 transition-all cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#14706B] to-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    KB
                  </div>
                </button>

                {/* Profile Popover */}
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-[#E4E7EC] p-3 space-y-3 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-2 border-b border-[#EAECF0] space-y-1">
                      <p className="font-bold text-xs text-[#101828]">Karthic B</p>
                      <p className="text-[11px] font-mono text-[#667085] truncate">bkarthic98@gmail.com</p>
                      <div className="pt-1">
                        <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-[#E8F4F3] text-[#14706B] uppercase">
                          {role.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <Link
                        href="/admin"
                        onClick={() => setProfileOpen(false)}
                        className="p-2 rounded-lg hover:bg-[#F9FAFB] flex items-center justify-between text-[#344054]"
                      >
                        <span>Admin Console</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#98A2B3]" />
                      </Link>
                      <Link
                        href="/dashboard"
                        onClick={() => setProfileOpen(false)}
                        className="p-2 rounded-lg hover:bg-[#F9FAFB] flex items-center justify-between text-[#344054]"
                      >
                        <span>Intelligent Radar</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#98A2B3]" />
                      </Link>
                    </div>

                    <div className="pt-2 border-t border-[#EAECF0]">
                      <button
                        onClick={handleSignOut}
                        className="w-full p-2 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-2 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
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
