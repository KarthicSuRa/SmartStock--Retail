'use client';

// /src/components/ui/Drawer.tsx
// SmartStock Experience V1 — Right-Side Operational Detail Drawer

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  children,
  footer,
  width = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthStyles = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-3xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0C111D]/40 backdrop-blur-[2px] transition-opacity duration-180"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          className={`w-screen ${widthStyles[width]} bg-white border-l border-[#E4E7EC] shadow-2xl flex flex-col justify-between transform transition-transform duration-200 ease-out`}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-[#E4E7EC] flex items-start justify-between bg-[#F9FAFB]">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {badge}
                <span className="text-[11px] font-mono text-[#667085]">SmartStock Detail</span>
              </div>
              <h2 className="text-base font-semibold text-[#101828] tracking-tight">{title}</h2>
              {subtitle && <p className="text-xs text-[#475467]">{subtitle}</p>}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-[6px] text-[#98A2B3] hover:text-[#344054] hover:bg-[#F2F4F7] transition-colors"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">{children}</div>

          {/* Footer Actions */}
          {footer && (
            <div className="px-6 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
