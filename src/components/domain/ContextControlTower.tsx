'use client';

// /src/components/domain/ContextControlTower.tsx
// SmartStock Context Intelligence V1 — External Context & Demand Signals Control Tower

import React from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Globe2, Sun, Calendar, Tag, Trophy, ShieldCheck, Activity, RefreshCw, CheckCircle2 } from 'lucide-react';

export const ContextControlTower: React.FC<{ className?: string }> = ({ className = '' }) => {
  const sources = [
    {
      name: 'Open-Meteo Weather API',
      category: 'WEATHER',
      provider: 'Open-Meteo ECMWF Vintages',
      status: 'HEALTHY',
      freshness: '18.4 min ago',
      coverage: '100% (All 16 Stores & DCs)',
      fallback: 'Climatological Monthly Normals',
      icon: Sun,
    },
    {
      name: 'National & Regional Holidays',
      category: 'CALENDAR',
      provider: 'Government.nl / Nager.Date',
      status: 'HEALTHY',
      freshness: '4.2 min ago',
      coverage: '100% (North/Central/South)',
      fallback: 'Annual Pre-loaded Schedule',
      icon: Calendar,
    },
    {
      name: 'First-Party Promotions & Pricing',
      category: 'COMMERCIAL',
      provider: 'SAP Retail Promotion Master',
      status: 'HEALTHY',
      freshness: '2.1 min ago',
      coverage: '100% (Active Assortment)',
      fallback: 'Base Retail Price Table',
      icon: Tag,
    },
    {
      name: 'Local High-Impact Venue Events',
      category: 'EVENTS',
      provider: 'Ticketmaster Discovery API',
      status: 'HEALTHY',
      freshness: '28.5 min ago',
      coverage: '92.4% (Major Arenas & Venues)',
      fallback: 'Zero-Impact Default',
      icon: Trophy,
    },
  ];

  const ablationProgress = [
    { name: '1. Internal Features Only (Baseline)', wape: '17.8%', gain: '—' },
    { name: '2. + Public & School Holidays', wape: '16.4%', gain: '+1.4pp' },
    { name: '3. + Retailer Promotions & Price', wape: '13.8%', gain: '+2.6pp' },
    { name: '4. + Weather Forecast Vintages', wape: '12.6%', gain: '+1.2pp' },
    { name: '5. + Local High-Impact Events', wape: '12.4%', gain: '+0.2pp' },
  ];

  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EAECF0] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[6px] bg-[#E8F4F3] border border-[#14706B]/20 text-[#14706B] flex items-center justify-center font-bold">
            <Globe2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#101828]">Context Intelligence Control Tower</h2>
            <p className="text-xs text-[#475467]">
              External demand signals, weather forecast vintages, holiday scopes, and feature ablation benchmarks.
            </p>
          </div>
        </div>

        <Badge status="healthy" size="md">
          External Feeds: 100% Operational
        </Badge>
      </div>

      {/* 4 External Feed Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sources.map((src) => {
          const Icon = src.icon;
          return (
            <div key={src.name} className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-7 h-7 rounded-[4px] bg-white border border-[#EAECF0] flex items-center justify-center text-[#14706B]">
                  <Icon className="w-4 h-4" />
                </div>
                <Badge status="healthy" size="sm">
                  {src.status}
                </Badge>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[#101828]">{src.name}</h4>
                <p className="text-[11px] text-[#667085]">{src.provider}</p>
              </div>

              <div className="pt-2 border-t border-[#EAECF0] font-mono text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#667085]">Freshness:</span>
                  <strong className="text-[#039855]">{src.freshness}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085]">Coverage:</span>
                  <strong className="text-[#101828]">{src.coverage}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Ablation Testing Progression */}
      <div className="op-card p-5 bg-white border border-[#E4E7EC] rounded-[8px] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold uppercase text-[#667085]">
              Empirical Feature Ablation Progression (WAPE Benchmark)
            </h4>
            <p className="text-xs text-[#475467]">
              Measures verified forecast error reduction as each external context signal is enabled.
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#EDFDF5] text-[#027A48] border border-[#A6F4C5]">
            Net Improvement: +5.4pp WAPE Gain
          </span>
        </div>

        <div className="overflow-x-auto border border-[#EAECF0] rounded-[6px]">
          <table className="w-full text-xs font-mono text-left">
            <thead className="bg-[#F2F4F7] text-[#475467]">
              <tr>
                <th className="p-2.5 font-semibold">Model Feature Combination</th>
                <th className="p-2.5 font-semibold text-right">Forecast WAPE</th>
                <th className="p-2.5 font-semibold text-right">Marginal Error Reduction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAECF0] bg-white">
              {ablationProgress.map((row, i) => (
                <tr key={i} className={i === ablationProgress.length - 1 ? 'bg-[#EDFDF5]' : ''}>
                  <td className="p-2.5 font-semibold text-[#101828]">{row.name}</td>
                  <td className="p-2.5 text-right font-bold text-[#101828]">{row.wape}</td>
                  <td className="p-2.5 text-right text-[#039855] font-bold">{row.gain}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
