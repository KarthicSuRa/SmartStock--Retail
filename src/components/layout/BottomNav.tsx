'use client';

// /src/components/layout/BottomNav.tsx
// SmartStock Experience V1 — Floor Staff PWA 3-Item Bottom Navigation

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, QrCode, Search } from 'lucide-react';

export interface BottomNavProps {
  role?: string;
  className?: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({ role, className = '' }) => {
  const pathname = usePathname();

  const items = [
    { label: 'Tasks', href: '/floor', icon: ClipboardList, badge: '6' },
    { label: 'Scan', href: '/floor/scan', icon: QrCode },
    { label: 'Search', href: '/inventory', icon: Search },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#E4E7EC] flex items-center justify-around z-40 px-2 select-none shadow-lg">
      {items.map(({ label, href, icon: Icon, badge }) => {
        const active = pathname === href || (href !== '/floor' && pathname.startsWith(href));

        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-colors ${
              active ? 'text-[#14706B] font-semibold' : 'text-[#667085] hover:text-[#101828]'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 ${active ? 'text-[#14706B]' : 'text-[#667085]'}`} />
              {badge && (
                <span className="absolute -top-1 -right-2 bg-[#D92D20] text-white text-[9px] font-mono font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {badge}
                </span>
              )}
            </div>
            <span className="text-[11px]">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
