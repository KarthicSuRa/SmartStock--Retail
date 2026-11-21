'use client';

// /src/app/(desktop)/reports/page.tsx
// SmartStock — Report centre: catalog of operational reports with charts and Excel / CSV / PDF export.

import React, { useMemo, useRef, useState } from 'react';
import { BarChart2, Boxes, ClipboardCheck, FileBarChart, LineChart as LineIcon, ListChecks, ShieldAlert, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { BarChart, DonutChart, LineChart, STATUS_COLORS } from '@/components/ui/Charts';
import { PageHeader, RoleGuard } from '@/components/domain/RoleGuard';
import { ExportColumn, ExportSheet } from '@/lib/export';
import { categoryStore, mcName, stockMapStore, STORES } from '@/lib/master-data';
import { taskStore, TASK_TYPES } from '@/lib/tasks';
import { activityStore, LOG_MODULES } from '@/lib/activity-log';
import { useI18n } from '@/lib/i18n';

type Row = Record<string, string | number>;

interface ReportDef {
  key: string;
  title: string;
  description: string;
  icon: React.ElementType;
  storeFilter?: boolean;
}

const REPORTS: ReportDef[] = [
  { key: 'sales_trend', title: 'Sales & Availability Trend', description: 'Daily net sales per store and on-shelf availability, last 14 days.', icon: TrendingUp, storeFilter: false },
  { key: 'category_perf', title: 'Category / MC Performance', description: 'Sales, stock value, margin and SKU count per merchandise category.', icon: BarChart2 },
  { key: 'stock_position', title: 'Shelf vs Back-Store Stock Position', description: 'Shelf and back-store quantities per SKU with replenishment status.', icon: Boxes, storeFilter: true },
  { key: 'count_variance', title: 'Cycle Count Variance', description: 'Book vs counted quantity and value variance per count.', icon: ClipboardCheck, storeFilter: true },
  { key: 'task_completion', title: 'Employee Task Completion', description: 'Daily task completion by employee and task type.', icon: ListChecks, storeFilter: true },
  { key: 'stockouts', title: 'Stockout Incidents', description: 'Stockout events, lost-sales estimate and root cause.', icon: LineIcon, storeFilter: true },
  { key: 'tx_errors', title: 'Transaction Success / Error Summary', description: 'Outcomes per module from the transaction log.', icon: ShieldAlert },
];

const DAYS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 6 + i));
  return `${String(d.getUTCDate()).padStart(2, '0')} Nov`;
});
// Deterministic pseudo-random for demo data
const wave = (seed: number, i: number) => Math.sin(seed * 12.9898 + i * 78.233) * 0.5 + 0.5;

const COUNT_DATA = [
  { id: 'CC-1112', store: '1001', sku: 'MAT-20349', desc: 'AirPods Pro (USB-C)', book: 27, counted: 25, unit: 249 },
  { id: 'CC-1114', store: '1001', sku: 'MAT-10021', desc: 'Organic Whole Milk 2L', book: 76, counted: 74, unit: 2.49 },
  { id: 'CC-1117', store: '1001', sku: 'MAT-30255', desc: 'Dark Chocolate 70% 100g', book: 81, counted: 79, unit: 2.19 },
  { id: 'CC-1118', store: '1001', sku: 'MAT-30112', desc: 'Sparkling Water 6×1.5L', book: 140, counted: 142, unit: 4.99 },
  { id: 'CC-1120', store: '1001', sku: 'MAT-10077', desc: 'Greek Yoghurt 500g', book: 48, counted: 45, unit: 3.29 },
  { id: 'CC-1121', store: '1001', sku: 'MAT-40322', desc: 'Toilet Tissue 9-roll', book: 59, counted: 59, unit: 5.49 },
  { id: 'CC-2203', store: '1002', sku: 'MAT-30201', desc: 'Sea Salt Chips 200g', book: 40, counted: 37, unit: 1.89 },
  { id: 'CC-2207', store: '1002', sku: 'MAT-10021', desc: 'Organic Whole Milk 2L', book: 32, counted: 32, unit: 2.49 },
];

const STOCKOUTS = [
  { date: '2026-11-08', store: '1001', sku: 'MAT-30140', desc: 'Arabica Coffee Beans 1kg', hours: 18, lost: 412, cause: 'Supplier short-ship' },
  { date: '2026-11-11', store: '1001', sku: 'MAT-20349', desc: 'AirPods Pro (USB-C)', hours: 6, lost: 1494, cause: 'Shelf empty, stock in back-store' },
  { date: '2026-11-13', store: '1002', sku: 'MAT-10021', desc: 'Organic Whole Milk 2L', hours: 4, lost: 87, cause: 'Late DC delivery' },
  { date: '2026-11-15', store: '1001', sku: 'MAT-10102', desc: 'Aged Gouda 400g', hours: 9, lost: 156, cause: 'Ghost inventory (count variance)' },
  { date: '2026-11-17', store: '1002', sku: 'MAT-30201', desc: 'Sea Salt Chips 200g', hours: 3, lost: 45, cause: 'Shelf empty, stock in back-store' },
  { date: '2026-11-18', store: '1001', sku: 'MAT-30140', desc: 'Arabica Coffee Beans 1kg', hours: 22, lost: 503, cause: 'Supplier short-ship' },
];

export default function ReportsPage() {
  return (
    <RoleGuard module="reports">
      <ReportsInner />
    </RoleGuard>
  );
}

function ReportsInner() {
  const { t } = useI18n();
  const [active, setActive] = useState('sales_trend');
  const [store, setStore] = useState('all');
  const chartRef = useRef<HTMLDivElement>(null);
  const [cats] = categoryStore.useStore();
  const [stockMap] = stockMapStore.useStore();
  const [tasks] = taskStore.useStore();
  const [log] = activityStore.useStore();

  const def = REPORTS.find((r) => r.key === active)!;
  const inStore = (s: string) => store === 'all' || s === store;

  const report = useMemo((): { columns: ExportColumn<Row>[]; rows: Row[]; chart: React.ReactNode; summary: Row[] } => {
    const cols = (keys: [string, string][]): ExportColumn<Row>[] => keys.map(([k, h]) => ({ header: h, value: (r) => r[k] }));

    switch (active) {
      case 'sales_trend': {
        const stores = STORES.filter((s) => ['1001', '1002', '1004'].includes(s.code));
        const sales = stores.map((s, si) => DAYS.map((_, i) => Math.round((si === 0 ? 14000 : si === 1 ? 9000 : 6000) * (0.8 + 0.4 * wave(si + 1, i)) * (i % 7 === 5 || i % 7 === 6 ? 1.25 : 1))));
        const osa = DAYS.map((_, i) => Math.round((95 + 4 * wave(9, i)) * 10) / 10);
        const rows = DAYS.map((d, i) => ({ date: d, ...Object.fromEntries(stores.map((s, si) => [s.code, sales[si][i]])), total: stores.reduce((acc, _, si) => acc + sales[si][i], 0), osa: osa[i] }));
        return {
          rows,
          columns: cols([['date', 'Date'], ...stores.map((s) => [s.code, `${s.name} (EUR)`] as [string, string]), ['total', 'Total (EUR)'], ['osa', 'On-shelf availability %']]),
          chart: (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div><h4 className="text-[11px] font-semibold text-[#475467] mb-1">Net sales per store (EUR)</h4><LineChart ariaLabel="Net sales per store" labels={DAYS} series={stores.map((s, si) => ({ name: s.name, values: sales[si] }))} /></div>
              <div><h4 className="text-[11px] font-semibold text-[#475467] mb-1">On-shelf availability (%)</h4><LineChart ariaLabel="On-shelf availability" labels={DAYS} series={[{ name: 'OSA %', values: osa }]} unit="%" /></div>
            </div>
          ),
          summary: [{ metric: 'Total sales (EUR)', value: rows.reduce((a, r) => a + (r.total as number), 0) }, { metric: 'Avg OSA %', value: Math.round((osa.reduce((a, b) => a + b, 0) / osa.length) * 10) / 10 }],
        };
      }
      case 'category_perf': {
        const mcs = cats.filter((c) => c.level === 'Merchandise Category');
        const rows = mcs.map((m) => ({ mc: m.code, name: m.name, dept: cats.find((c) => c.code === cats.find((p) => p.code === m.parent)?.parent)?.name ?? '', skus: m.skuCount ?? 0, sales: m.sales30d ?? 0, stock: m.stockValue ?? 0, margin: m.margin ?? 0, cover: m.sales30d ? Math.round(((m.stockValue ?? 0) / (m.sales30d / 30)) * 10) / 10 : 0 }));
        const top = [...rows].sort((a, b) => b.sales - a.sales).slice(0, 8);
        const byDept = Array.from(new Set(rows.map((r) => r.dept))).map((d) => ({ name: d, value: rows.filter((r) => r.dept === d).reduce((a, r) => a + r.sales, 0) }));
        return {
          rows,
          columns: cols([['mc', 'MC'], ['name', 'Merchandise category'], ['dept', 'Department'], ['skus', 'SKUs'], ['sales', 'Sales 30d (EUR)'], ['stock', 'Stock value (EUR)'], ['margin', 'Margin %'], ['cover', 'Days of cover']]),
          chart: (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3"><h4 className="text-[11px] font-semibold text-[#475467] mb-1">Top 8 MCs — sales 30d (EUR)</h4><BarChart ariaLabel="Top merchandise categories by sales" labels={top.map((r) => r.name)} series={[{ name: 'Sales 30d', values: top.map((r) => r.sales) }]} /></div>
              <div className="lg:col-span-2"><h4 className="text-[11px] font-semibold text-[#475467] mb-2">Sales share by department</h4><DonutChart ariaLabel="Sales share by department" centerLabel="EUR sales" slices={byDept} /></div>
            </div>
          ),
          summary: byDept.map((d) => ({ metric: `Sales ${d.name}`, value: d.value })),
        };
      }
      case 'stock_position': {
        const rows = stockMap.filter((m) => inStore(m.store)).map((m) => ({ store: m.store, sku: m.sku, desc: m.description, mc: `${m.mc} ${mcName(m.mc, cats)}`, shelf: m.shelfQty, cap: m.shelfCapacity, min: m.minShelf, bin: m.bin, back: m.backQty, status: m.shelfQty < m.minShelf ? (m.backQty > 0 ? 'Replenish shelf' : 'Back-store empty') : 'OK' }));
        const top = rows.slice(0, 10);
        return {
          rows,
          columns: cols([['store', 'Store'], ['sku', 'SKU'], ['desc', 'Description'], ['mc', 'MC'], ['shelf', 'Shelf qty'], ['cap', 'Shelf cap'], ['min', 'Min shelf'], ['bin', 'Back-store bin'], ['back', 'Back-store qty'], ['status', 'Status']]),
          chart: (<div><h4 className="text-[11px] font-semibold text-[#475467] mb-1">Shelf vs back-store quantity (first 10 SKUs)</h4><BarChart ariaLabel="Shelf versus back-store quantity" labels={top.map((r) => r.desc)} series={[{ name: 'Shelf', values: top.map((r) => r.shelf) }, { name: 'Back-store', values: top.map((r) => r.back) }]} /></div>),
          summary: ['OK', 'Replenish shelf', 'Back-store empty'].map((s) => ({ metric: s, value: rows.filter((r) => r.status === s).length })),
        };
      }
      case 'count_variance': {
        const rows = COUNT_DATA.filter((c) => inStore(c.store)).map((c) => ({ id: c.id, store: c.store, sku: c.sku, desc: c.desc, book: c.book, counted: c.counted, varQty: c.counted - c.book, varPct: Math.round(((c.counted - c.book) / c.book) * 1000) / 10, varValue: Math.round((c.counted - c.book) * c.unit * 100) / 100 }));
        return {
          rows,
          columns: cols([['id', 'Count'], ['store', 'Store'], ['sku', 'SKU'], ['desc', 'Description'], ['book', 'Book qty'], ['counted', 'Counted qty'], ['varQty', 'Variance qty'], ['varPct', 'Variance %'], ['varValue', 'Variance value (EUR)']]),
          chart: (<div><h4 className="text-[11px] font-semibold text-[#475467] mb-1">Absolute variance value per count (EUR)</h4><BarChart ariaLabel="Count variance value" labels={rows.map((r) => r.desc)} series={[{ name: '|Variance| EUR', values: rows.map((r) => Math.abs(r.varValue)) }]} /></div>),
          summary: [{ metric: 'Net variance value (EUR)', value: Math.round(rows.reduce((a, r) => a + r.varValue, 0) * 100) / 100 }, { metric: 'Counts with variance', value: rows.filter((r) => r.varQty !== 0).length }],
        };
      }
      case 'task_completion': {
        const st = tasks.filter((x) => inStore(x.store));
        const people = Array.from(new Set(st.map((x) => x.assignee)));
        const rows = people.map((p) => {
          const mine = st.filter((x) => x.assignee === p);
          const done = mine.filter((x) => x.status === 'done').length;
          return { employee: p, store: mine[0]?.store ?? '', assigned: mine.length, done, open: mine.length - done, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 };
        });
        const byType = TASK_TYPES.map((ty) => ({ name: ty.label, value: st.filter((x) => x.type === ty.key).length })).filter((x) => x.value > 0);
        return {
          rows,
          columns: cols([['employee', 'Employee'], ['store', 'Store'], ['assigned', 'Assigned'], ['done', 'Completed'], ['open', 'Open'], ['pct', 'Completion %']]),
          chart: (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3"><h4 className="text-[11px] font-semibold text-[#475467] mb-1">Tasks by employee</h4><BarChart ariaLabel="Tasks assigned and completed by employee" labels={rows.map((r) => r.employee)} series={[{ name: 'Assigned', values: rows.map((r) => r.assigned) }, { name: 'Completed', values: rows.map((r) => r.done) }]} /></div>
              <div className="lg:col-span-2"><h4 className="text-[11px] font-semibold text-[#475467] mb-2">Tasks by type</h4><DonutChart ariaLabel="Tasks by type" centerLabel="tasks" slices={byType} /></div>
            </div>
          ),
          summary: [{ metric: 'Tasks', value: st.length }, { metric: 'Completed', value: st.filter((x) => x.status === 'done').length }],
        };
      }
      case 'stockouts': {
        const rows = STOCKOUTS.filter((s) => inStore(s.store)).map((s) => ({ ...s }));
        const causes = Array.from(new Set(rows.map((r) => r.cause))).map((c) => ({ name: c, value: rows.filter((r) => r.cause === c).reduce((a, r) => a + r.lost, 0) }));
        return {
          rows,
          columns: cols([['date', 'Date'], ['store', 'Store'], ['sku', 'SKU'], ['desc', 'Description'], ['hours', 'Hours out of stock'], ['lost', 'Est. lost sales (EUR)'], ['cause', 'Root cause']]),
          chart: (<div><h4 className="text-[11px] font-semibold text-[#475467] mb-2">Estimated lost sales by root cause (EUR)</h4><DonutChart ariaLabel="Lost sales by root cause" centerLabel="EUR lost" slices={causes} /></div>),
          summary: [{ metric: 'Incidents', value: rows.length }, { metric: 'Est. lost sales (EUR)', value: rows.reduce((a, r) => a + r.lost, 0) }],
        };
      }
      case 'tx_errors':
      default: {
        const mods = LOG_MODULES.filter((m) => log.some((e) => e.module === m.key));
        const rows = mods.map((m) => {
          const es = log.filter((e) => e.module === m.key);
          const s = es.filter((e) => e.status === 'success').length;
          const er = es.filter((e) => e.status === 'error').length;
          const w = es.filter((e) => e.status === 'warning').length;
          return { module: m.label, success: s, error: er, warning: w, total: es.length, rate: Math.round((s / es.length) * 100) };
        });
        return {
          rows,
          columns: cols([['module', 'Module'], ['success', 'Success'], ['error', 'Error'], ['warning', 'Warning'], ['total', 'Total'], ['rate', 'Success rate %']]),
          chart: (<div><h4 className="text-[11px] font-semibold text-[#475467] mb-1">Outcomes by module</h4><BarChart ariaLabel="Transaction outcomes by module" labels={rows.map((r) => r.module)} series={[{ name: 'Success', color: STATUS_COLORS.success, values: rows.map((r) => r.success) }, { name: 'Error', color: STATUS_COLORS.error, values: rows.map((r) => r.error) }, { name: 'Warning', color: STATUS_COLORS.warning, values: rows.map((r) => r.warning) }]} /></div>),
          summary: [{ metric: 'Transactions', value: log.length }, { metric: 'Errors', value: log.filter((e) => e.status === 'error').length }],
        };
      }
    }
  }, [active, store, cats, stockMap, tasks, log]); // eslint-disable-line react-hooks/exhaustive-deps

  const summarySheet: ExportSheet<Row> = { name: 'Summary', rows: report.summary, columns: [{ header: 'Metric', value: (r) => r.metric }, { header: 'Value', value: (r) => r.value }] };
  const storeLabel = store === 'all' ? 'All stores' : `${store} ${STORES.find((s) => s.code === store)?.name}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Reports')}
        subtitle="Operational reports with graphical views. Export any report to Excel (.xlsx with summary sheet), CSV, or PDF (with charts)."
        badge={<Badge status="healthy" size="sm">{REPORTS.length} reports</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <nav className="op-card bg-white p-2 h-fit space-y-0.5" aria-label="Report catalog">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <button key={r.key} onClick={() => setActive(r.key)} className={`w-full text-start p-2.5 rounded-lg flex gap-2.5 ${active === r.key ? 'bg-[#E8F4F3]' : 'hover:bg-[#F9FAFB]'}`}>
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${active === r.key ? 'text-[#14706B]' : 'text-[#667085]'}`} />
                <span>
                  <span className={`block text-xs font-semibold ${active === r.key ? 'text-[#14706B]' : 'text-[#101828]'}`}>{r.title}</span>
                  <span className="block text-[11px] text-[#667085] leading-snug">{r.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="lg:col-span-3 space-y-4">
          <div className="op-card bg-white p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#101828] flex items-center gap-2"><FileBarChart className="w-4 h-4 text-[#14706B]" /> {def.title}</h2>
                <p className="text-[11px] text-[#667085]">{def.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {def.storeFilter && (
                  <select value={store} onChange={(e) => setStore(e.target.value)} className="border border-[#D0D5DD] rounded-lg text-xs px-2 h-8 bg-white" aria-label={t('Store')}>
                    <option value="all">All stores</option>
                    {STORES.filter((s) => s.format !== 'DC').map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
                  </select>
                )}
                <ExportMenu
                  title={def.title}
                  subtitle={`${def.storeFilter ? storeLabel + ' · ' : ''}${report.rows.length} rows`}
                  module="reports"
                  landscape
                  rows={report.rows}
                  columns={report.columns}
                  extraSheets={[summarySheet]}
                  pdfHtmlBefore={() => {
                    // Embed chart SVGs (+ their legends) in the PDF
                    const el = chartRef.current;
                    if (!el) return undefined;
                    const clone = el.cloneNode(true) as HTMLElement;
                    clone.querySelectorAll('[tabindex]').forEach((n) => n.removeAttribute('tabindex'));
                    return `<div style="display:flex;flex-wrap:wrap;gap:16px">${Array.from(clone.querySelectorAll('svg[role="img"]')).map((s) => `<div style="flex:1;min-width:260px">${(s as SVGElement).outerHTML}</div>`).join('')}</div>`;
                  }}
                />
              </div>
            </div>
            <div ref={chartRef}>{report.chart}</div>
          </div>

          <div className="op-card bg-white overflow-hidden">
            <div className="p-3 border-b border-[#EAECF0] flex flex-wrap gap-3 text-xs">
              {report.summary.map((s) => (
                <span key={String(s.metric)} className="px-2 py-1 rounded bg-[#F9FAFB] border border-[#EAECF0]"><span className="text-[#667085]">{s.metric}:</span> <b className="font-mono text-[#101828]">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</b></span>
              ))}
            </div>
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs border-collapse min-w-[640px]">
                <thead className="sticky top-0">
                  <tr className="border-b border-[#EAECF0] bg-[#F9FAFB] text-[#667085]">
                    {report.columns.map((c) => <th key={c.header} className="py-2.5 px-3 font-semibold text-start whitespace-nowrap">{c.header}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAECF0]">
                  {report.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-[#F9FAFB]">
                      {report.columns.map((c) => {
                        const v = c.value(r);
                        return <td key={c.header} className={`py-2 px-3 ${typeof v === 'number' ? 'text-end font-mono' : 'text-[#344054]'}`}>{typeof v === 'number' ? v.toLocaleString() : v}</td>;
                      })}
                    </tr>
                  ))}
                  {report.rows.length === 0 && <tr><td colSpan={report.columns.length} className="py-8 text-center text-[#667085]">No data for this selection.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
