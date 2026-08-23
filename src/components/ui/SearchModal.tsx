'use client';

// /src/components/ui/SearchModal.tsx
// SmartStock Experience V1 — Cmd+K Global Search Modal

import React, { useState, useEffect } from 'react';
import { Search, X, Package, AlertCircle, FileText, ArrowRight, CornerDownLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface SearchResultItem {
  id: string;
  type: 'product' | 'action' | 'document' | 'store';
  title: string;
  subtitle: string;
  href: string;
}

export interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const sampleResults: SearchResultItem[] = [
    {
      id: 'p-1',
      type: 'product',
      title: 'Coca Cola Zero 330ml (24 Pack)',
      subtitle: 'SKU-DRINK-001 · 12 Units Sellable · Stockout Risk',
      href: '/inventory?sku=SKU-DRINK-001',
    },
    {
      id: 'p-2',
      type: 'product',
      title: 'AirPods Pro (USB-C)',
      subtitle: 'AP-PRO-USB-C · 4 Units · 92% Confidence',
      href: '/inventory?sku=AP-PRO-USB-C',
    },
    {
      id: 'a-1',
      type: 'action',
      title: 'Approve Transfer 12 units from Amsterdam Zuid',
      subtitle: 'AirPods Pro Stockout Risk · Due in 2h 18m',
      href: '/actions?case=case-01',
    },
    {
      id: 'd-1',
      type: 'document',
      title: 'SAP Stock Transfer Order 4500019281',
      subtitle: 'Confirmed · 12 Units in transit to Store 1001',
      href: '/replenishment?sto=4500019281',
    },
  ];

  const filtered = query
    ? sampleResults.filter(
        (r) =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          r.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : sampleResults;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Handled in parent
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((idx) => (idx + 1) % Math.max(1, filtered.length));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((idx) => (idx - 1 + filtered.length) % Math.max(1, filtered.length));
        } else if (e.key === 'Enter' && filtered[selectedIndex]) {
          e.preventDefault();
          router.push(filtered[selectedIndex].href);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filtered, selectedIndex, router]);

  if (!isOpen) return null;

  const typeIcons = {
    product: Package,
    action: AlertCircle,
    document: FileText,
    store: ArrowRight,
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-[#0C111D]/40 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white border border-[#E4E7EC] rounded-[10px] shadow-2xl overflow-hidden flex flex-col z-10 animate-in fade-in-0 zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-[#E4E7EC] bg-[#F9FAFB]">
          <Search className="w-4 h-4 text-[#98A2B3] flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search SKU, product, action, SAP document, PO, or STO..."
            className="w-full px-3 py-3.5 bg-transparent text-sm text-[#101828] placeholder-[#98A2B3] focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[#98A2B3] hover:text-[#344054]">
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-[#EAECF0] text-[10px] font-mono text-[#475467]">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-[#F2F4F7]">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#667085]">
              No matching records for "{query}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = typeIcons[item.type] || Package;
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    router.push(item.href);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-3 py-2.5 rounded-[6px] flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#F2F4F7]' : 'hover:bg-[#F9FAFB]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-1.5 rounded-[4px] border ${
                        item.type === 'action'
                          ? 'bg-[#FEF3F2] border-[#FECDCA] text-[#D92D20]'
                          : 'bg-[#F2F4F7] border-[#EAECF0] text-[#475467]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[#101828]">{item.title}</p>
                      <p className="text-[11px] text-[#667085]">{item.subtitle}</p>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-[#98A2B3]">
                      <span>Jump</span>
                      <CornerDownLeft className="w-3 h-3" />
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="px-4 py-2 border-t border-[#E4E7EC] bg-[#F9FAFB] flex items-center justify-between text-[11px] text-[#667085]">
          <span>Use ↑↓ keys to navigate</span>
          <span>↵ to select</span>
        </div>
      </div>
    </div>
  );
};
