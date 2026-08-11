// /src/components/layout/BottomNav.tsx

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScanLine, BarChart3, Settings, Package } from 'lucide-react';

const floorLinks = [
  { href: '/floor', label: 'Home', icon: Home },
  { href: '/floor/scan', label: 'Scan', icon: ScanLine },
  { href: '/floor/count', label: 'Count', icon: Package },
  { href: '/floor/damage', label: 'Damage', icon: Settings },
];

const managerLinks = [
  { href: '/manager', label: 'Dashboard', icon: Home },
  { href: '/manager/alerts', label: 'Alerts', icon: Package },
  { href: '/manager/procurement', label: 'Procure', icon: ScanLine },
  { href: '/manager/analytics', label: 'Analytics', icon: BarChart3 },
];

export function BottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const links = role === 'floor_staff' ? floorLinks : managerLinks;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-2 pb-safe z-50">
      <div className="flex items-center justify-around">
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors ${
                isActive ? 'text-blue-600 bg-blue-50' : 'text-slate-400'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
