'use client';

// /src/app/(desktop)/admin/compatibility/page.tsx
// SmartStock — Device / OS / browser compatibility + language support.

import React, { useEffect, useState } from 'react';
import { Check, Globe2, Minus, MonitorSmartphone, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/domain/RoleGuard';
import { LANGUAGES, translate, translationCoverage, useI18n } from '@/lib/i18n';

type Support = 'yes' | 'partial' | 'no';
const FEATURES = ['Desktop web app', 'Floor PWA (install)', 'Camera barcode scan', 'Offline mode', 'Push notifications', 'Excel / PDF export'];

const MATRIX: { device: string; os: string; browsers: string; support: Support[]; note?: string }[] = [
  { device: 'Windows PC / laptop', os: 'Windows 10, 11', browsers: 'Chrome, Edge, Firefox (latest 2)', support: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes'] },
  { device: 'Mac', os: 'macOS 13 Ventura +', browsers: 'Safari 16.4+, Chrome, Edge, Firefox', support: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes'] },
  { device: 'Linux / ChromeOS', os: 'Ubuntu 22.04+, ChromeOS 110+', browsers: 'Chrome, Firefox', support: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes'] },
  { device: 'Android phone', os: 'Android 10 +', browsers: 'Chrome, Samsung Internet', support: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes'] },
  { device: 'iPhone', os: 'iOS 16.4 +', browsers: 'Safari (Add to Home Screen)', support: ['yes', 'yes', 'yes', 'yes', 'partial', 'yes'], note: 'Push requires the PWA installed to home screen (iOS 16.4+).' },
  { device: 'iPad / Android tablet', os: 'iPadOS 16.4+, Android 10+', browsers: 'Safari, Chrome', support: ['yes', 'yes', 'yes', 'yes', 'partial', 'yes'] },
  { device: 'Zebra TC2x / TC5x / TC7x', os: 'Android 11 +', browsers: 'Chrome / Enterprise Browser', support: ['partial', 'yes', 'yes', 'yes', 'yes', 'partial'], note: 'Hardware scanner via DataWedge keyboard wedge; small screen → floor views recommended.' },
  { device: 'Honeywell CT40 / CT60', os: 'Android 10 +', browsers: 'Chrome', support: ['partial', 'yes', 'yes', 'yes', 'yes', 'partial'] },
  { device: 'Legacy (IE 11, Android < 9, iOS < 15)', os: '—', browsers: '—', support: ['no', 'no', 'no', 'no', 'no', 'no'], note: 'Not supported — no modern JS / service worker support.' },
];

const Icon = ({ s }: { s: Support }) =>
  s === 'yes' ? <Check className="w-4 h-4 text-[#027A48] mx-auto" aria-label="Supported" /> : s === 'partial' ? <Minus className="w-4 h-4 text-[#B54708] mx-auto" aria-label="Partial" /> : <X className="w-4 h-4 text-[#B42318] mx-auto" aria-label="Not supported" />;

interface Detected { [k: string]: string | boolean }

function detect(): Detected {
  const ua = navigator.userAgent;
  const os = /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Mac OS X/.test(ua) && !/Mobile/.test(ua) ? (navigator.maxTouchPoints > 1 ? 'iPadOS' : 'macOS') : /Android ([\d.]+)/.test(ua) ? `Android ${ua.match(/Android ([\d.]+)/)?.[1]}` : /iPhone OS ([\d_]+)/.test(ua) ? `iOS ${ua.match(/iPhone OS ([\d_]+)/)?.[1].replace(/_/g, '.')}` : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const browser = /Edg\/([\d]+)/.test(ua) ? `Edge ${ua.match(/Edg\/(\d+)/)?.[1]}` : /SamsungBrowser\/(\d+)/.test(ua) ? `Samsung Internet ${ua.match(/SamsungBrowser\/(\d+)/)?.[1]}` : /Chrome\/(\d+)/.test(ua) ? `Chrome ${ua.match(/Chrome\/(\d+)/)?.[1]}` : /Firefox\/(\d+)/.test(ua) ? `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1]}` : /Version\/([\d.]+).*Safari/.test(ua) ? `Safari ${ua.match(/Version\/([\d.]+)/)?.[1]}` : 'Unknown';
  const w = window.innerWidth;
  return {
    'Operating system': os,
    Browser: browser,
    'Screen / viewport': `${window.screen.width}×${window.screen.height} · ${w}×${window.innerHeight}`,
    'Layout mode': w < 768 ? 'Mobile' : w < 1024 ? 'Tablet' : 'Desktop',
    'Touch screen': navigator.maxTouchPoints > 0,
    'Camera API': !!navigator.mediaDevices?.getUserMedia,
    'Service worker (offline)': 'serviceWorker' in navigator,
    'IndexedDB storage': 'indexedDB' in window,
    'Push notifications': 'PushManager' in window,
    'Installed as app (PWA)': window.matchMedia('(display-mode: standalone)').matches,
    Online: navigator.onLine,
    'Browser language': navigator.language,
  };
}

export default function CompatibilityPage() {
  const { t, lang, setLang, dir } = useI18n();
  const [info, setInfo] = useState<Detected | null>(null);
  const coverage = translationCoverage();

  useEffect(() => {
    const run = () => setInfo(detect());
    run();
    window.addEventListener('resize', run);
    window.addEventListener('online', run);
    window.addEventListener('offline', run);
    return () => {
      window.removeEventListener('resize', run);
      window.removeEventListener('online', run);
      window.removeEventListener('offline', run);
    };
  }, []);

  const sampleDate = new Date(Date.UTC(2026, 10, 19, 14, 30));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Devices & Languages')}
        subtitle="Supported devices, operating systems and browsers, a live check of this device, and the languages available in SmartStock."
        badge={<Badge status="healthy" size="sm">Responsive · PWA · RTL ready</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="op-card bg-white p-4 space-y-2">
          <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider flex items-center gap-1.5"><MonitorSmartphone className="w-3.5 h-3.5" /> This device</h2>
          {info ? (
            <dl className="text-xs divide-y divide-[#EAECF0]">
              {Object.entries(info).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-[#667085]">{k}</dt>
                  <dd className="font-mono text-end text-[#101828]">
                    {typeof v === 'boolean' ? (v ? <span className="text-[#027A48]">✓ yes</span> : <span className="text-[#98A2B3]">✕ no</span>) : v}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-[#667085]">Detecting…</p>
          )}
        </div>

        <div className="op-card bg-white overflow-hidden lg:col-span-2">
          <div className="p-4 border-b border-[#EAECF0]"><h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider">Device / OS support matrix</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="bg-[#F9FAFB] text-[#667085] border-b border-[#EAECF0]">
                  <th className="py-2 px-3 text-start font-semibold">Device</th>
                  <th className="py-2 px-3 text-start font-semibold">OS / browsers</th>
                  {FEATURES.map((f) => <th key={f} className="py-2 px-1 text-center font-semibold"><span className="block max-w-[80px] mx-auto leading-tight">{f}</span></th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAECF0]">
                {MATRIX.map((m) => (
                  <tr key={m.device}>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-[#101828]">{m.device}</div>
                      {m.note && <div className="text-[10px] text-[#667085] max-w-[220px]">{m.note}</div>}
                    </td>
                    <td className="py-2 px-3 text-[#475467]"><div>{m.os}</div><div className="text-[10px] text-[#98A2B3]">{m.browsers}</div></td>
                    {m.support.map((s, i) => <td key={i} className="py-2 px-1 text-center"><Icon s={s} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 text-[11px] text-[#667085] flex gap-4 border-t border-[#EAECF0]">
            <span className="inline-flex items-center gap-1"><Check className="w-3 h-3 text-[#027A48]" /> Supported</span>
            <span className="inline-flex items-center gap-1"><Minus className="w-3 h-3 text-[#B54708]" /> Partial</span>
            <span className="inline-flex items-center gap-1"><X className="w-3 h-3 text-[#B42318]" /> Not supported</span>
          </div>
        </div>
      </div>

      <div className="op-card bg-white overflow-hidden">
        <div className="p-4 border-b border-[#EAECF0] flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5" /> {t('Language')} support</h2>
          <span className="text-[11px] text-[#667085]">Current: <b>{LANGUAGES.find((l) => l.code === lang)?.native}</b> · direction {dir.toUpperCase()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="bg-[#F9FAFB] text-[#667085] border-b border-[#EAECF0]">
                <th className="py-2 px-3 text-start font-semibold">Language</th>
                <th className="py-2 px-3 text-start font-semibold">Sample</th>
                <th className="py-2 px-3 text-start font-semibold">Number / currency</th>
                <th className="py-2 px-3 text-start font-semibold">Date</th>
                <th className="py-2 px-3 text-start font-semibold">Coverage</th>
                <th className="py-2 px-3 text-end font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAECF0]">
              {LANGUAGES.map((l) => {
                const pct = coverage.find((c) => c.code === l.code)?.pct ?? 0;
                return (
                  <tr key={l.code} className={lang === l.code ? 'bg-[#E8F4F3]' : ''}>
                    <td className="py-2 px-3"><div className="font-semibold text-[#101828]">{l.native}</div><div className="text-[10px] text-[#667085]">{l.label} · {l.locale}{l.dir === 'rtl' ? ' · RTL' : ''}</div></td>
                    <td className="py-2 px-3" dir={l.dir}>{translate(l.code, 'Daily Tasks')} · {translate(l.code, 'Reports')}</td>
                    <td className="py-2 px-3 font-mono" dir={l.dir}>{new Intl.NumberFormat(l.locale, { style: 'currency', currency: l.locale.endsWith('IN') ? 'INR' : l.locale === 'ar-AE' ? 'AED' : 'EUR' }).format(1234567.89)}</td>
                    <td className="py-2 px-3 font-mono" dir={l.dir}>{new Intl.DateTimeFormat(l.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(sampleDate)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-[#F2F4F7] overflow-hidden"><div className="h-full bg-[#14706B]" style={{ width: `${pct}%` }} /></div>
                        <span className="font-mono">{pct}%</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-end">
                      {lang === l.code ? <Badge status="healthy" size="sm">Active</Badge> : <button onClick={() => setLang(l.code)} className="text-[#14706B] font-semibold hover:underline">Switch</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="p-3 text-[11px] text-[#667085] border-t border-[#EAECF0]">
          Navigation, common actions and new modules are translated; untranslated text falls back to English. Exports are UTF-8 so Hindi, Tamil and Arabic open correctly in Excel. Add languages in <span className="font-mono">src/lib/i18n.tsx</span>.
        </p>
      </div>
    </div>
  );
}
