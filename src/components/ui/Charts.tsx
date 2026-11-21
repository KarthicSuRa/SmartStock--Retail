'use client';

// /src/components/ui/Charts.tsx
// Lightweight SVG charts (no dependencies). Palette validated for CVD separation on white;
// contrast WARN for slots 3–5 is relieved by legends, direct labels and table views on every page.

import React, { useState } from 'react';

export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const INK = '#101828';
const INK_2 = '#475467';
const GRID = '#EAECF0';

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(n * 10) / 10));

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export const STATUS_COLORS = { success: "#0ca30c", error: "#d03b3b", warning: "#fab219" };
const colorOf = (s: { name: string; color?: string }, i: number) => s.color ?? SERIES_COLORS[i % SERIES_COLORS.length];

export interface Series {
  color?: string;
  name: string;
  values: number[];
}

function Legend({ series }: { series: { name: string; color?: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#475467] mb-2">
      {series.map((s, i) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(s, i) }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, title, lines }: { x: number; y: number; title: string; lines: { color: string; label: string; value: string }[] }) {
  return (
    <div
      className="pointer-events-none absolute z-10 bg-white border border-[#E4E7EC] rounded-lg shadow-lg px-2.5 py-1.5 text-[11px] min-w-[120px]"
      style={{ left: `${x}%`, top: y, transform: 'translate(-50%, -100%)' }}
    >
      <div className="font-semibold text-[#101828] mb-0.5">{title}</div>
      {lines.map((l) => (
        <div key={l.label} className="flex items-center justify-between gap-3 text-[#475467]">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </span>
          <span className="font-mono text-[#101828]">{l.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Vertical (grouped) bar chart. */
export function BarChart({ labels, series, height = 220, unit = '', ariaLabel }: { labels: string[]; series: Series[]; height?: number; unit?: string; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, padL = 44, padR = 8, padT = 12, padB = 34;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const band = plotW / Math.max(1, labels.length);
  const gap = 2;
  const barW = Math.max(4, Math.min(28, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  return (
    <div className="relative">
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={padL} x2={W - padR} y1={y(tk)} y2={y(tk)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(tk) + 3} textAnchor="end" fontSize={10} fill={INK_2}>{fmt(tk)}</text>
          </g>
        ))}
        {labels.map((lab, i) => {
          const x0 = padL + band * i + (band - groupW) / 2;
          return (
            <g key={lab}>
              {hover === i && <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="#F2F4F7" />}
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = Math.max(0, (v / max) * plotH);
                const x = x0 + si * (barW + gap);
                const r = Math.min(4, barW / 2, h);
                // rounded top, square baseline
                const d = `M${x},${padT + plotH} V${padT + plotH - h + r} Q${x},${padT + plotH - h} ${x + r},${padT + plotH - h} H${x + barW - r} Q${x + barW},${padT + plotH - h} ${x + barW},${padT + plotH - h + r} V${padT + plotH} Z`;
                return <path key={s.name} d={d} fill={colorOf(s, si)} />;
              })}
              <text x={padL + band * i + band / 2} y={H - 16} textAnchor="middle" fontSize={10} fill={INK_2}>
                {lab.length > 12 ? lab.slice(0, 11) + '…' : lab}
              </text>
              <rect x={padL + band * i} y={padT} width={band} height={plotH + 20} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${lab}: ${series.map((s) => `${s.name} ${fmt(s.values[i] ?? 0)}${unit}`).join(', ')}`} />
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="#D0D5DD" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <Tooltip
          x={((padL + band * hover + band / 2) / W) * 100}
          y={24}
          title={labels[hover]}
          lines={series.map((s, si) => ({ color: colorOf(s, si), label: s.name, value: `${fmt(s.values[hover] ?? 0)}${unit}` }))}
        />
      )}
    </div>
  );
}

/** Multi-series line chart with crosshair tooltip. */
export function LineChart({ labels, series, height = 220, unit = '', ariaLabel }: { labels: string[]; series: Series[]; height?: number; unit?: string; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, padL = 44, padR = 12, padT = 12, padB = 30;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (i: number) => padL + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.ceil(labels.length / 8);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / plotW) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <div className="relative">
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={padL} x2={W - padR} y1={y(tk)} y2={y(tk)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(tk) + 3} textAnchor="end" fontSize={10} fill={INK_2}>{fmt(tk)}</text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text key={l + i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill={INK_2}>{l}</text>
          ) : null
        )}
        {series.map((s, si) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={colorOf(s, si)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
        {/* Direct end labels (≤ 4 series) */}
        {series.length <= 4 &&
          series.map((s, si) => {
            const last = s.values.length - 1;
            return (
              <circle key={s.name} cx={x(last)} cy={y(s.values[last] ?? 0)} r={4} fill={colorOf(s, si)} stroke="#fff" strokeWidth={2} />
            );
          })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="#98A2B3" strokeDasharray="3 3" />
            {series.map((s, si) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={colorOf(s, si)} stroke="#fff" strokeWidth={2} />
            ))}
          </g>
        )}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="#D0D5DD" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <Tooltip
          x={(x(hover) / W) * 100}
          y={24}
          title={labels[hover]}
          lines={series.map((s, si) => ({ color: colorOf(s, si), label: s.name, value: `${fmt(s.values[hover] ?? 0)}${unit}` }))}
        />
      )}
    </div>
  );
}

/** Donut for part-to-whole (≤ 6 slices). Always legend + value labels. */
export function DonutChart({ slices, ariaLabel, centerLabel }: { slices: { name: string; value: number }[]; ariaLabel: string; centerLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 70, r = 46, C = 90;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const a0 = angle;
    const a1 = angle + (s.value / total) * Math.PI * 2;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const d = `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
    return { d, color: colorOf(s, i), ...s };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 180 180" className="w-40 h-40 shrink-0" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {arcs.map((a, i) => (
          <path key={a.name} d={a.d} fill={a.color} stroke="#fff" strokeWidth={2} opacity={hover === null || hover === i ? 1 : 0.45} onMouseEnter={() => setHover(i)} />
        ))}
        <text x={C} y={C - 2} textAnchor="middle" fontSize={20} fontWeight={700} fill={INK}>
          {hover === null ? fmt(total) : `${Math.round((slices[hover].value / total) * 100)}%`}
        </text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={9} fill={INK_2}>
          {hover === null ? centerLabel ?? 'Total' : slices[hover].name.slice(0, 18)}
        </text>
      </svg>
      <ul className="space-y-1 text-xs w-full">
        {arcs.map((a, i) => (
          <li key={a.name} className="flex items-center justify-between gap-3" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="inline-flex items-center gap-1.5 text-[#344054]">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
              {a.name}
            </span>
            <span className="font-mono text-[#101828]">
              {fmt(a.value)} <span className="text-[#667085]">({Math.round((a.value / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
