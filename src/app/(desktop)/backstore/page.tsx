'use client';

// /src/app/(desktop)/backstore/page.tsx
// SmartStock — Back-Store Mapping. Shows, for every product, where it sits on the sales floor (shelf)
// and which back-room bin holds the reserve, and lets staff keep the shelf stocked from the bin.

import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowRightLeft, ArrowUp, Boxes, CheckCircle2, PackageOpen, Search, Store, Warehouse, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { PageHeader, ReadOnlyBanner, RoleGuard } from '@/components/domain/RoleGuard';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useToast } from '@/hooks/useToast';
import { Bin, binStore, mcName, stockMapStore, STORES, StockMapping } from '@/lib/master-data';
import { logActivity } from '@/lib/activity-log';
import { useAuthorization } from '@/lib/roles';
import { useI18n } from '@/lib/i18n';

type MoveType = 'to_shelf' | 'to_backstore' | 'bin_to_bin';
type Status = 'replenish' | 'empty' | 'ok';
type Tab = 'products' | 'bins';
type StatusFilter = 'all' | Status;
type MoveDraft = { row: StockMapping; type: MoveType; qty: number; toBin: string };

const STATUS_META: Record<Status, { label: string; hint: string; color: string; badge: 'warning' | 'critical' | 'healthy' }> = {
  replenish: { label: 'Refill shelf', hint: 'Shelf is below minimum. Move stock from the bin.', color: '#F79009', badge: 'warning' },
  empty: { label: 'Bin empty', hint: 'Shelf is low and the bin is empty. Order stock.', color: '#D92D20', badge: 'critical' },
  ok: { label: 'OK', hint: 'Shelf and bin levels are fine.', color: '#12B76A', badge: 'healthy' },
};

const MOVE_OPTIONS: { type: MoveType; title: string; desc: string; icon: React.ElementType }[] = [
  { type: 'to_shelf', title: 'Refill shelf', desc: 'Move stock from the back-room bin onto the sales floor.', icon: ArrowUp },
  { type: 'to_backstore', title: 'Return to bin', desc: 'Move stock from the shelf back into the bin.', icon: ArrowDown },
  { type: 'bin_to_bin', title: 'Move bin', desc: 'Move all stock to a different bin (re-slotting).', icon: ArrowRightLeft },
];

const statusOf = (m: StockMapping): Status =>
  m.shelfQty < m.minShelf ? (m.backQty > 0 ? 'replenish' : 'empty') : 'ok';

/** Single source of truth for move rules: used by the live preview and by posting. Returns an error message or null. */
function validateMove(d: MoveDraft, storeBins: Bin[], binUsage: Record<string, number>): string | null {
  const { row, type, qty, toBin } = d;

  if (type === 'bin_to_bin') {
    const target = storeBins.find((b) => b.code === toBin);
    if (!target) return 'Choose a destination bin.';
    if (target.code === row.bin) return 'Pick a different bin from the current one.';
    if (target.blocked) return `Bin ${target.code} is blocked.`;
    if (row.backQty === 0) return 'There is no stock in the bin to move.';
    const free = target.capacity - (binUsage[target.code] ?? 0);
    if (row.backQty > free) return `Bin ${target.code} has only ${free} ${row.uom} free.`;
    return null;
  }

  if (!Number.isInteger(qty) || qty <= 0) return 'Enter a whole number greater than 0.';

  if (type === 'to_shelf') {
    if (qty > row.backQty) return `Only ${row.backQty} ${row.uom} are in bin ${row.bin}.`;
    if (row.shelfQty + qty > row.shelfCapacity)
      return `The shelf holds ${row.shelfCapacity} ${row.uom} at most and has ${row.shelfQty} now.`;
    return null;
  }

  // to_backstore
  if (qty > row.shelfQty) return `Only ${row.shelfQty} ${row.uom} are on the shelf.`;
  const bin = storeBins.find((b) => b.code === row.bin);
  if (bin) {
    const free = bin.capacity - (binUsage[row.bin] ?? 0);
    if (qty > free) return `Bin ${row.bin} has only ${free} ${row.uom} free.`;
  }
  return null;
}

export default function BackStorePage() {
  return (
    <RoleGuard module="backstore">
      <BackStoreInner />
    </RoleGuard>
  );
}

function BackStoreInner() {
  const { activeStoreId } = useStoreContext();
  const { toast } = useToast();
  const { t } = useI18n();
  const { canEdit } = useAuthorization('backstore');
  const [bins] = binStore.useStore();
  const [mapping, setMapping] = stockMapStore.useStore();

  const storeOptions = Array.from(new Set(bins.map((b) => b.store)));
  const [store, setStore] = useState<string>(storeOptions.includes(activeStoreId ?? '') ? (activeStoreId as string) : '1001');
  const [tab, setTab] = useState<Tab>('products');
  const [query, setQuery] = useState('');
  const [binFilter, setBinFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [move, setMove] = useState<MoveDraft | null>(null);

  const storeBins = bins.filter((b) => b.store === store);
  const storeMap = mapping.filter((m) => m.store === store);
  const binByCode = useMemo(() => Object.fromEntries(storeBins.map((b) => [b.code, b])), [storeBins]);

  // Units currently held in each bin (sum of back-room qty of every product in that bin)
  const binUsage = useMemo(() => {
    const u: Record<string, number> = {};
    storeMap.forEach((m) => (u[m.bin] = (u[m.bin] ?? 0) + m.backQty));
    return u;
  }, [storeMap]);

  const counts = {
    all: storeMap.length,
    replenish: storeMap.filter((m) => statusOf(m) === 'replenish').length,
    empty: storeMap.filter((m) => statusOf(m) === 'empty').length,
    ok: storeMap.filter((m) => statusOf(m) === 'ok').length,
  };

  const rows = storeMap
    .filter((m) => {
      if (binFilter && m.bin !== binFilter) return false;
      if (statusFilter !== 'all' && statusOf(m) !== statusFilter) return false;
      const q = query.trim().toLowerCase();
      return !q || [m.sku, m.description, m.bin, m.shelfLocation, mcName(m.mc)].some((v) => v.toLowerCase().includes(q));
    })
    .sort((a, b) => statusRank(statusOf(a)) - statusRank(statusOf(b)));

  const actionable = storeMap.filter((m) => statusOf(m) !== 'ok').sort((a, b) => statusRank(statusOf(a)) - statusRank(statusOf(b)));

  const totalCap = storeBins.reduce((s, b) => s + b.capacity, 0);
  const totalUsed = Object.values(binUsage).reduce((s, v) => s + v, 0);
  const activeBins = Object.values(binUsage).filter((v) => v > 0).length;
  const zones = Array.from(new Set(storeBins.map((b) => b.zone)));

  const openMove = (row: StockMapping, type: MoveType) => {
    const need = Math.max(0, row.shelfCapacity - row.shelfQty);
    const defaultQty = type === 'to_shelf' ? Math.min(need, row.backQty) : type === 'to_backstore' ? 1 : row.backQty;
    const toBin = storeBins.find((b) => b.code !== row.bin && !b.blocked)?.code ?? '';
    setMove({ row, type, qty: defaultQty, toBin });
  };

  const executeMove = () => {
    if (!move) return;
    const { row, type, toBin } = move;
    const qty = type === 'bin_to_bin' ? row.backQty : move.qty;
    const error = validateMove({ ...move, qty }, storeBins, binUsage);
    if (error) {
      logActivity({ module: 'backstore', action: 'Bin movement', entity: `${row.sku} · ${row.bin}`, status: 'error', message: error });
      toast({ type: 'error', title: "Can't post this move", description: error });
      return;
    }

    const key = (m: StockMapping) => m.sku === row.sku && m.store === row.store;
    if (type === 'to_shelf') {
      setMapping((prev) => prev.map((m) => (key(m) ? { ...m, backQty: m.backQty - qty, shelfQty: m.shelfQty + qty } : m)));
      logActivity({ module: 'backstore', action: 'Bin movement (bin → shelf)', entity: `${row.sku} · ${row.bin} → ${row.shelfLocation}`, status: 'success', message: `${qty} ${row.uom} moved` });
    } else if (type === 'to_backstore') {
      setMapping((prev) => prev.map((m) => (key(m) ? { ...m, backQty: m.backQty + qty, shelfQty: m.shelfQty - qty } : m)));
      logActivity({ module: 'backstore', action: 'Bin movement (shelf → bin)', entity: `${row.sku} · ${row.shelfLocation} → ${row.bin}`, status: 'success', message: `${qty} ${row.uom} moved` });
    } else {
      setMapping((prev) => prev.map((m) => (key(m) ? { ...m, bin: toBin } : m)));
      logActivity({ module: 'backstore', action: 'Bin movement (re-slot)', entity: `${row.sku} · ${row.bin} → ${toBin}`, status: 'success', message: `${row.backQty} ${row.uom} re-slotted` });
    }

    toast({ type: 'success', title: 'Stock moved', description: `${row.description}: ${qty} ${row.uom}` });
    setMove(null);
  };

  const openBin = (code: string) => {
    setBinFilter(code);
    setStatusFilter('all');
    setQuery('');
    setTab('products');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Back-Store Mapping')}
        subtitle="Each product has a spot on the sales floor (shelf) and a bin in the back room. Keep shelves stocked from their bin."
        badge={<Badge status="healthy" size="sm">Shelf ↔ Bin</Badge>}
        actions={
          <select
            value={store}
            onChange={(e) => { setStore(e.target.value); setBinFilter(null); }}
            aria-label="Store"
            className="border border-[#D0D5DD] rounded-lg text-xs font-semibold px-3 py-2 bg-white"
          >
            {storeOptions.map((s) => (
              <option key={s} value={s}>{s} · {STORES.find((x) => x.code === s)?.name}</option>
            ))}
          </select>
        }
      />

      <ReadOnlyBanner module="backstore" />

      {/* How it works */}
      <div className="op-card bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Step n={1} icon={Warehouse} title="Stock lives in a bin" text="The back-room bin (e.g. BS-A-01-02) is the reserve for each product." />
        <Step n={2} icon={Store} title="The shelf is what customers see" text="The shelf location (e.g. SF-12-A) has a maximum and a minimum level." />
        <Step n={3} icon={ArrowUp} title="Refill when the shelf is low" text="When the shelf drops below its minimum, move stock from the bin to the shelf." />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={PackageOpen} label="Shelves to refill" value={String(counts.replenish)} hint="Low shelf, stock is in the bin" tone={counts.replenish ? 'warn' : undefined} />
        <Kpi icon={AlertTriangle} label="Low shelf, bin empty" value={String(counts.empty)} hint="Order stock (PO / STO)" tone={counts.empty ? 'crit' : undefined} />
        <Kpi icon={Boxes} label="Bins in use" value={`${activeBins} / ${storeBins.length}`} hint={`${zones.length} zones`} />
        <Kpi icon={Warehouse} label="Back-room space used" value={`${totalCap ? Math.round((totalUsed / totalCap) * 100) : 0}%`} hint={`${totalUsed.toLocaleString()} of ${totalCap.toLocaleString()} units`} />
      </div>

      {/* Needs action */}
      {actionable.length > 0 && (
        <div className="op-card bg-white p-4 space-y-3" style={{ borderInlineStartWidth: 4, borderInlineStartColor: STATUS_META.replenish.color }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#101828] inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B54708]" /> Needs action now
            </h2>
            <span className="text-[11px] text-[#667085]">{actionable.length} {actionable.length === 1 ? 'product' : 'products'}</span>
          </div>
          <ul className="divide-y divide-[#EAECF0]">
            {actionable.map((m) => {
              const s = statusOf(m);
              const canRefill = canEdit && m.backQty > 0;
              return (
                <li key={m.sku + m.store} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#101828] truncate">{m.description}</div>
                    <div className="text-[11px] text-[#667085] font-mono">
                      Shelf {m.shelfQty}/{m.shelfCapacity} (min {m.minShelf}) · Bin {m.bin} · {m.backQty} {m.uom}
                    </div>
                  </div>
                  <Badge status={STATUS_META[s].badge} size="sm">{STATUS_META[s].label}</Badge>
                  {canRefill && (
                    <button onClick={() => openMove(m, 'to_shelf')} className="px-3 py-1.5 rounded-lg bg-[#14706B] text-white text-xs font-bold hover:bg-[#0E5652] whitespace-nowrap">
                      Refill shelf
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[#F2F4F7] rounded-xl w-full sm:w-fit" role="tablist">
        {([['products', `Products (${storeMap.length})`], ['bins', `Bins (${storeBins.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold ${tab === k ? 'bg-white shadow text-[#14706B]' : 'text-[#475467]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'products' ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="op-card bg-white p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative w-full md:w-72">
                <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-[#98A2B3]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search product, SKU, shelf, bin…"
                  className="ps-8 pe-3 py-2 border border-[#D0D5DD] rounded-lg text-xs w-full"
                />
              </div>
              <ExportMenu
                title={`Back-Store Mapping ${store}`}
                module="backstore"
                landscape
                rows={rows}
                columns={[
                  { header: 'SKU', value: (r) => r.sku },
                  { header: 'Description', value: (r) => r.description },
                  { header: 'MC', value: (r) => `${r.mc} ${mcName(r.mc)}` },
                  { header: 'Shelf location', value: (r) => r.shelfLocation },
                  { header: 'Shelf qty', value: (r) => r.shelfQty },
                  { header: 'Shelf capacity', value: (r) => r.shelfCapacity },
                  { header: 'Min shelf', value: (r) => r.minShelf },
                  { header: 'Back-store bin', value: (r) => r.bin },
                  { header: 'Back-store qty', value: (r) => r.backQty },
                  { header: 'UoM', value: (r) => r.uom },
                  { header: 'Status', value: (r) => STATUS_META[statusOf(r)].label },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {(['all', 'replenish', 'empty', 'ok'] as StatusFilter[]).map((k) => {
                const label = k === 'all' ? t('All') : STATUS_META[k].label;
                const active = statusFilter === k;
                return (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(k)}
                    aria-pressed={active}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? 'bg-[#14706B] border-[#14706B] text-white' : 'bg-white border-[#D0D5DD] text-[#344054] hover:bg-[#F9FAFB]'}`}
                  >
                    {label} <span className="opacity-70">({counts[k]})</span>
                  </button>
                );
              })}
              {binFilter && (
                <button
                  onClick={() => setBinFilter(null)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#E8F4F3] text-[#14706B] inline-flex items-center gap-1"
                >
                  Bin {binFilter} <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Product cards */}
          {rows.length === 0 ? (
            <div className="op-card bg-white p-8 text-center text-xs text-[#667085]">No products match these filters.</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {rows.map((m) => (
                <ProductCard
                  key={m.sku + m.store}
                  m={m}
                  zone={binByCode[m.bin]?.zone}
                  canEdit={canEdit}
                  onAction={(type) => openMove(m, type)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Bins view */
        <div className="op-card bg-white p-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#101828]">Back-room bins</h2>
              <p className="text-[11px] text-[#667085]">Tap a bin to see the products stored in it.</p>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-[#475467]">
              <Legend color="#14706B" label="Under 70% full" />
              <Legend color="#F79009" label="70–90%" />
              <Legend color="#D92D20" label="Over 90%" />
            </div>
          </div>

          {zones.map((zone) => (
            <section key={zone} className="space-y-2">
              <div className="text-[11px] font-bold text-[#344054] uppercase tracking-wider">{zone}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {storeBins.filter((b) => b.zone === zone).map((b) => {
                  const used = binUsage[b.code] ?? 0;
                  const pct = b.capacity ? Math.min(100, Math.round((used / b.capacity) * 100)) : 0;
                  const productsInBin = storeMap.filter((m) => m.bin === b.code).length;
                  const color = pct > 90 ? '#D92D20' : pct >= 70 ? '#F79009' : '#14706B';
                  return (
                    <button
                      key={b.code}
                      onClick={() => openBin(b.code)}
                      className="text-start p-3 rounded-xl border border-[#EAECF0] hover:border-[#14706B] hover:shadow-sm bg-white transition-all"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold text-[#101828]">{b.code}</span>
                        {b.blocked && <Badge status="critical" size="sm">Blocked</Badge>}
                      </div>
                      <div className="h-2 rounded-full bg-[#F2F4F7] mt-2 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="flex justify-between text-[11px] text-[#667085] mt-1.5">
                        <span className="font-mono">{used}/{b.capacity}</span>
                        <span>{productsInBin} {productsInBin === 1 ? 'product' : 'products'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Move dialog */}
      {move && (
        <MoveDialog
          move={move}
          setMove={setMove}
          storeBins={storeBins}
          binUsage={binUsage}
          onCancel={() => setMove(null)}
          onPost={executeMove}
        />
      )}
    </div>
  );
}

// ───────────────────────── Product card ─────────────────────────

function ProductCard({ m, zone, canEdit, onAction }: { m: StockMapping; zone?: string; canEdit: boolean; onAction: (type: MoveType) => void }) {
  const s = statusOf(m);
  const meta = STATUS_META[s];
  const shelfPct = m.shelfCapacity ? Math.min(100, Math.round((m.shelfQty / m.shelfCapacity) * 100)) : 0;
  const minPct = m.shelfCapacity ? Math.min(100, Math.round((m.minShelf / m.shelfCapacity) * 100)) : 0;

  return (
    <article className="op-card bg-white p-4 flex flex-col gap-3" style={{ borderInlineStartWidth: 4, borderInlineStartColor: meta.color }}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#101828] truncate">{m.description}</h3>
          <div className="text-[11px] text-[#667085] font-mono">{m.sku} · {mcName(m.mc)}</div>
        </div>
        <Badge status={meta.badge} size="sm">{meta.label}</Badge>
      </header>

      {/* Visual: bin → shelf */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-lg border border-[#EAECF0] bg-[#F9FAFB] p-2.5">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wide inline-flex items-center gap-1"><Warehouse className="w-3 h-3" /> Back-room bin</div>
          <div className="font-mono text-xs font-bold text-[#14706B] mt-1">{m.bin}</div>
          <div className="text-[10px] text-[#667085]">{zone}</div>
          <div className="font-mono text-sm font-bold text-[#101828] mt-1.5">{m.backQty} <span className="text-[10px] font-semibold text-[#667085]">{m.uom}</span></div>
        </div>

        <div className="flex items-center text-[#98A2B3]"><ArrowRightLeft className="w-4 h-4" /></div>

        <div className="rounded-lg border border-[#EAECF0] bg-[#F9FAFB] p-2.5">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wide inline-flex items-center gap-1"><Store className="w-3 h-3" /> Sales-floor shelf</div>
          <div className="font-mono text-xs font-bold text-[#101828] mt-1 truncate" title={m.shelfLocation}>{m.shelfLocation}</div>
          <div className="relative h-2 rounded-full bg-[#E4E7EC] mt-2">
            <div className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${shelfPct}%`, background: s === 'ok' ? '#12B76A' : meta.color }} />
            {/* minimum marker */}
            <div className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-[#101828]" style={{ insetInlineStart: `${minPct}%` }} title={`Minimum ${m.minShelf}`} />
          </div>
          <div className="font-mono text-[11px] text-[#344054] mt-1">
            <span className="font-bold">{m.shelfQty}</span>
            <span className="text-[#98A2B3]">/{m.shelfCapacity}</span>
            <span className="text-[#98A2B3]"> · min {m.minShelf}</span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#475467] flex items-start gap-1.5">
        {s === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 text-[#12B76A] shrink-0 mt-px" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: meta.color }} />}
        {meta.hint}
      </p>

      {canEdit && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-[#EAECF0]">
          <button
            onClick={() => onAction('to_shelf')}
            disabled={m.backQty === 0}
            className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-[#14706B] text-white text-xs font-bold hover:bg-[#0E5652] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Refill shelf
          </button>
          <button onClick={() => onAction('bin_to_bin')} className="px-3 py-1.5 rounded-lg border border-[#D0D5DD] text-[#344054] text-xs font-semibold hover:bg-[#F9FAFB]">
            Move bin
          </button>
          <button
            onClick={() => onAction('to_backstore')}
            disabled={m.shelfQty === 0}
            className="px-3 py-1.5 rounded-lg border border-[#D0D5DD] text-[#344054] text-xs font-semibold hover:bg-[#F9FAFB] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Return to bin
          </button>
        </div>
      )}
    </article>
  );
}

// ───────────────────────── Move dialog ─────────────────────────

function MoveDialog({
  move, setMove, storeBins, binUsage, onCancel, onPost,
}: {
  move: MoveDraft;
  setMove: React.Dispatch<React.SetStateAction<MoveDraft | null>>;
  storeBins: Bin[];
  binUsage: Record<string, number>;
  onCancel: () => void;
  onPost: () => void;
}) {
  const { row, type } = move;
  const qty = type === 'bin_to_bin' ? row.backQty : move.qty;
  const error = validateMove({ ...move, qty }, storeBins, binUsage);
  const need = Math.max(0, row.shelfCapacity - row.shelfQty);
  const option = MOVE_OPTIONS.find((o) => o.type === type);

  const selectType = (t: MoveType) =>
    setMove((prev) => prev && {
      ...prev,
      type: t,
      qty: t === 'to_shelf' ? Math.min(need, row.backQty) : t === 'to_backstore' ? 1 : row.backQty,
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-title"
        className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="move-title" className="text-sm font-bold text-[#101828]">Move stock</h3>
          <button onClick={onCancel} aria-label="Close" className="p-1 rounded hover:bg-[#F2F4F7]"><X className="w-4 h-4 text-[#667085]" /></button>
        </div>

        <div className="rounded-lg bg-[#F9FAFB] border border-[#EAECF0] p-3">
          <div className="text-xs font-bold text-[#101828]">{row.description}</div>
          <div className="text-[11px] text-[#667085] font-mono mt-0.5">{row.sku} · bin {row.bin} · shelf {row.shelfLocation}</div>
        </div>

        {/* Choose the kind of move */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Type of move">
          {MOVE_OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = type === o.type;
            return (
              <button
                key={o.type}
                role="radio"
                aria-checked={active}
                onClick={() => selectType(o.type)}
                className={`text-start p-3 rounded-xl border transition-all ${active ? 'border-[#14706B] ring-2 ring-[#14706B]/20 bg-[#E8F4F3]' : 'border-[#D0D5DD] hover:bg-[#F9FAFB]'}`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#14706B]' : 'text-[#667085]'}`} />
                <div className="text-xs font-bold text-[#101828] mt-1.5">{o.title}</div>
                <div className="text-[11px] text-[#667085] mt-0.5 leading-snug">{o.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Quantity or destination */}
        {type === 'bin_to_bin' ? (
          <label className="block text-xs">
            <span className="font-semibold text-[#344054]">Move to bin</span>
            <select
              value={move.toBin}
              onChange={(e) => setMove({ ...move, toBin: e.target.value })}
              className="mt-1 w-full border border-[#D0D5DD] rounded-lg px-2 py-2 bg-white"
            >
              {storeBins.filter((b) => b.code !== row.bin).map((b) => (
                <option key={b.code} value={b.code} disabled={!!b.blocked}>
                  {b.code} · {b.zone} · {b.capacity - (binUsage[b.code] ?? 0)} {row.uom} free{b.blocked ? ' · blocked' : ''}
                </option>
              ))}
            </select>
            <span className="block mt-1.5 text-[11px] text-[#667085]">The whole bin content ({row.backQty} {row.uom}) moves together.</span>
          </label>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs">
              <span className="font-semibold text-[#344054]">
                Quantity ({row.uom}) · max {type === 'to_shelf' ? Math.min(row.backQty, need) : row.shelfQty}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={move.qty}
                onChange={(e) => setMove({ ...move, qty: e.target.value === '' ? 0 : Number(e.target.value) })}
                className="mt-1 w-full border border-[#D0D5DD] rounded-lg px-2 py-2 font-mono"
              />
            </label>
            <div className="flex gap-2">
              {type === 'to_shelf' && (
                <>
                  <QuickQty onClick={() => setMove({ ...move, qty: Math.min(need, row.backQty) })}>Fill shelf</QuickQty>
                  <QuickQty onClick={() => setMove({ ...move, qty: row.backQty })}>All in bin</QuickQty>
                </>
              )}
              {type === 'to_backstore' && <QuickQty onClick={() => setMove({ ...move, qty: row.shelfQty })}>All from shelf</QuickQty>}
            </div>
          </div>
        )}

        {/* Before / after preview */}
        <Preview move={move} qty={qty} binUsage={binUsage} />

        {error ? (
          <div className="rounded-lg bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] text-xs px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
          </div>
        ) : (
          <div className="rounded-lg bg-[#ECFDF3] border border-[#ABEFC6] text-[#067647] text-xs px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready to post: {option?.title.toLowerCase()}.
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onCancel} className="px-3 py-2 text-xs font-semibold rounded-lg border border-[#D0D5DD] hover:bg-[#F9FAFB]">Cancel</button>
          <button
            onClick={onPost}
            disabled={!!error}
            className="px-3 py-2 text-xs font-bold rounded-lg bg-[#14706B] text-white hover:bg-[#0E5652] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Post movement
          </button>
        </div>
      </div>
    </div>
  );
}

function Preview({ move, qty, binUsage }: { move: MoveDraft; qty: number; binUsage: Record<string, number> }) {
  const { row, type, toBin } = move;
  const safe = Number.isFinite(qty) && qty > 0 ? qty : 0;
  let lines: { label: string; from: number; to: number }[] = [];

  if (type === 'to_shelf') {
    lines = [
      { label: 'Shelf', from: row.shelfQty, to: row.shelfQty + safe },
      { label: `Bin ${row.bin}`, from: row.backQty, to: row.backQty - safe },
    ];
  } else if (type === 'to_backstore') {
    lines = [
      { label: 'Shelf', from: row.shelfQty, to: row.shelfQty - safe },
      { label: `Bin ${row.bin}`, from: row.backQty, to: row.backQty + safe },
    ];
  } else {
    lines = [
      { label: `Bin ${row.bin}`, from: row.backQty, to: 0 },
      { label: `Bin ${toBin || '—'}`, from: binUsage[toBin] ?? 0, to: (binUsage[toBin] ?? 0) + row.backQty },
    ];
  }

  return (
    <div className="rounded-lg border border-[#EAECF0] p-3 space-y-1.5">
      <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wide">Result</div>
      {lines.map((l) => (
        <div key={l.label} className="flex items-center justify-between text-xs">
          <span className="text-[#475467]">{l.label}</span>
          <span className="font-mono font-semibold text-[#101828]">
            {l.from} <span className="text-[#98A2B3]">→</span> <span className={l.to < 0 ? 'text-[#B42318]' : 'text-[#14706B]'}>{l.to}</span> <span className="text-[#98A2B3] font-normal">{row.uom}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Small pieces ─────────────────────────

const statusRank = (s: Status) => (s === 'empty' ? 0 : s === 'replenish' ? 1 : 2);

function Step({ n, icon: Icon, title, text }: { n: number; icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-[#E8F4F3] text-[#14706B] text-xs font-bold flex items-center justify-center shrink-0">{n}</div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-[#101828] inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-[#14706B]" /> {title}</div>
        <div className="text-[11px] text-[#667085] mt-0.5 leading-snug">{text}</div>
      </div>
    </div>
  );
}

function QuickQty({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="px-2.5 py-1 rounded-md border border-[#D0D5DD] text-[11px] font-semibold text-[#344054] hover:bg-[#F9FAFB]">
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} /> {label}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: React.ElementType; label: string; value: string; hint: string; tone?: 'warn' | 'crit' }) {
  return (
    <div className="op-card bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#667085]">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${tone === 'crit' ? 'text-[#B42318]' : tone === 'warn' ? 'text-[#B54708]' : 'text-[#101828]'}`}>{value}</div>
      <div className="text-[11px] text-[#667085]">{hint}</div>
    </div>
  );
}
