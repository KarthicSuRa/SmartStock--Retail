'use client';

// /src/app/(desktop)/admin/categories/page.tsx
// SmartStock — Category / Merchandise Category (MC) hierarchy: Department → Category → MC (SAP MATKL / WWGHA).

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { BarChart, DonutChart } from '@/components/ui/Charts';
import { PageHeader, ReadOnlyBanner, RoleGuard } from '@/components/domain/RoleGuard';
import { useToast } from '@/hooks/useToast';
import { BUYERS, categoryStore, CategoryNode } from '@/lib/master-data';
import { logActivity } from '@/lib/activity-log';
import { useAuthorization } from '@/lib/roles';
import { useI18n } from '@/lib/i18n';

const eur = (n: number) => `€${Math.round(n).toLocaleString()}`;

export default function CategoriesPage() {
  return (
    <RoleGuard module="categories">
      <CategoriesInner />
    </RoleGuard>
  );
}

function CategoriesInner() {
  const [nodes, setNodes] = categoryStore.useStore();
  const { canEdit } = useAuthorization('categories');
  const { toast } = useToast();
  const { t } = useI18n();
  const [open, setOpen] = useState<Record<string, boolean>>({ '10': true, '20': true });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>('101010');
  const [adding, setAdding] = useState<{ parent: string; code: string; name: string } | null>(null);

  const children = (code: string | null) => nodes.filter((n) => n.parent === code);
  const mcs = nodes.filter((n) => n.level === 'Merchandise Category');

  // Roll-up of MC metrics to category / department
  const rollup = useMemo(() => {
    const r: Record<string, { sku: number; value: number; sales: number }> = {};
    const add = (code: string | null, m: CategoryNode) => {
      while (code) {
        r[code] = r[code] ?? { sku: 0, value: 0, sales: 0 };
        r[code].sku += m.skuCount ?? 0;
        r[code].value += m.stockValue ?? 0;
        r[code].sales += m.sales30d ?? 0;
        code = nodes.find((n) => n.code === code)?.parent ?? null;
      }
    };
    mcs.forEach((m) => add(m.code, m));
    return r;
  }, [nodes, mcs]);

  const depts = children(null);
  const q = query.trim().toLowerCase();
  const matches = (n: CategoryNode): boolean =>
    !q || n.name.toLowerCase().includes(q) || n.code.includes(q) || children(n.code).some(matches);

  const sel = nodes.find((n) => n.code === selected);

  const reassignBuyer = (code: string, buyer: string) => {
    const before = nodes.find((n) => n.code === code)?.buyer;
    setNodes((prev) => prev.map((n) => (n.code === code ? { ...n, buyer } : n)));
    logActivity({ module: 'categories', action: 'Buyer reassigned', entity: `${code} ${sel?.name}: ${before ?? '—'} → ${buyer}`, status: 'success' });
    toast({ type: 'success', title: 'Buyer updated', description: `${code} → ${BUYERS.find((b) => b.code === buyer)?.name}` });
  };

  const addNode = () => {
    if (!adding) return;
    const parent = nodes.find((n) => n.code === adding.parent);
    const err = !/^\d+$/.test(adding.code)
      ? 'Code must be numeric.'
      : !adding.code.startsWith(adding.parent)
      ? `Code must start with parent code ${adding.parent}.`
      : nodes.some((n) => n.code === adding.code)
      ? `Code ${adding.code} already exists.`
      : !adding.name.trim()
      ? 'Name is required.'
      : null;
    if (err) {
      logActivity({ module: 'categories', action: 'Create category node', entity: adding.code || '(blank)', status: 'error', message: err });
      toast({ type: 'error', title: 'Cannot create', description: err });
      return;
    }
    const level: CategoryNode['level'] = parent?.level === 'Department' ? 'Category' : 'Merchandise Category';
    const node: CategoryNode = { code: adding.code, name: adding.name.trim(), level, parent: adding.parent, buyer: parent?.buyer, ...(level === 'Merchandise Category' ? { skuCount: 0, stockValue: 0, sales30d: 0, margin: 0, tempZone: 'Ambient' as const } : {}) };
    setNodes((prev) => [...prev, node]);
    setOpen((o) => ({ ...o, [adding.parent]: true }));
    setSelected(node.code);
    logActivity({ module: 'categories', action: `Create ${level}`, entity: `${node.code} ${node.name} (under ${adding.parent})`, status: 'success' });
    toast({ type: 'success', title: `${level} created`, description: `${node.code} ${node.name}` });
    setAdding(null);
  };

  const renderNode = (n: CategoryNode, depth: number): React.ReactNode => {
    if (!matches(n)) return null;
    const kids = children(n.code);
    const isOpen = open[n.code] || !!q;
    const r = rollup[n.code];
    return (
      <div key={n.code}>
        <div
          className={`flex items-center gap-2 py-1.5 pe-2 rounded-md cursor-pointer text-xs ${selected === n.code ? 'bg-[#E8F4F3] text-[#14706B]' : 'hover:bg-[#F9FAFB] text-[#344054]'}`}
          style={{ paddingInlineStart: 8 + depth * 18 }}
          onClick={() => setSelected(n.code)}
        >
          {kids.length ? (
            <button onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [n.code]: !isOpen })); }} aria-label={isOpen ? 'Collapse' : 'Expand'}>
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-3.5" />
          )}
          <span className="font-mono text-[#667085] w-14 shrink-0">{n.code}</span>
          <span className={`flex-1 truncate ${n.level !== 'Merchandise Category' ? 'font-bold' : ''}`}>{n.name}</span>
          <span className="hidden sm:inline font-mono text-[10px] text-[#98A2B3]">{r?.sku ?? 0} SKU</span>
        </div>
        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  const deptChart = depts.map((d) => ({ name: d.name, sales: rollup[d.code]?.sales ?? 0, value: rollup[d.code]?.value ?? 0 }));
  const path = (code: string | undefined): string => {
    const n = nodes.find((x) => x.code === code);
    return n ? (n.parent ? `${path(n.parent)} › ` : '') + n.name : '';
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Category / MC')}
        subtitle="Merchandise category hierarchy (Department → Category → MC) with buyer ownership, SKU counts and roll-ups used by reports, replenishment and authorizations."
        badge={<Badge status="healthy" size="sm">{mcs.length} merchandise categories</Badge>}
        actions={
          <ExportMenu
            title="Merchandise Category Hierarchy"
            module="categories"
            landscape
            rows={nodes}
            columns={[
              { header: 'Code', value: (n) => n.code },
              { header: 'Name', value: (n) => n.name },
              { header: 'Level', value: (n) => n.level },
              { header: 'Parent', value: (n) => n.parent ?? '' },
              { header: 'Path', value: (n) => path(n.code) },
              { header: 'Buyer', value: (n) => (n.buyer ? `${n.buyer} ${BUYERS.find((b) => b.code === n.buyer)?.name ?? ''}` : '') },
              { header: 'SKUs', value: (n) => rollup[n.code]?.sku ?? 0 },
              { header: 'Stock value (EUR)', value: (n) => rollup[n.code]?.value ?? 0 },
              { header: 'Sales 30d (EUR)', value: (n) => rollup[n.code]?.sales ?? 0 },
              { header: 'Margin %', value: (n) => n.margin ?? '' },
              { header: 'Temp zone', value: (n) => n.tempZone ?? '' },
            ]}
          />
        }
      />
      <ReadOnlyBanner module="categories" />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Tree */}
        <div className="op-card bg-white p-3 lg:col-span-2 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-[#98A2B3]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code or name…" className="ps-8 pe-3 py-2 border border-[#D0D5DD] rounded-lg text-xs w-full" />
          </div>
          <div className="max-h-[520px] overflow-y-auto">{depts.map((d) => renderNode(d, 0))}</div>
        </div>

        {/* Detail */}
        <div className="op-card bg-white p-5 lg:col-span-3 space-y-4">
          {sel ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] text-[#667085]">{path(sel.parent ?? undefined) || 'Top level'}</div>
                  <h2 className="text-lg font-bold text-[#101828] flex items-center gap-2"><FolderTree className="w-4 h-4 text-[#14706B]" /> {sel.code} · {sel.name}</h2>
                  <Badge status="neutral" size="sm">{sel.level}</Badge>
                </div>
                {canEdit && sel.level !== 'Merchandise Category' && (
                  <button onClick={() => setAdding({ parent: sel.code, code: sel.code, name: '' })} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#14706B] text-white">
                    <Plus className="w-3.5 h-3.5" /> Add {sel.level === 'Department' ? 'category' : 'MC'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Stat label="SKUs" value={(rollup[sel.code]?.sku ?? 0).toLocaleString()} />
                <Stat label="Stock value" value={eur(rollup[sel.code]?.value ?? 0)} />
                <Stat label="Sales (30d)" value={eur(rollup[sel.code]?.sales ?? 0)} />
                <Stat label="Margin" value={sel.margin != null ? `${sel.margin}%` : '—'} />
              </div>

              {sel.level !== 'Department' && (
                <label className="block text-xs max-w-sm">
                  <span className="font-semibold text-[#344054]">Responsible buyer (purchasing group)</span>
                  <select disabled={!canEdit} value={sel.buyer ?? ''} onChange={(e) => reassignBuyer(sel.code, e.target.value)} className="mt-1 w-full border border-[#D0D5DD] rounded-lg px-2 py-2 bg-white disabled:bg-[#F9FAFB]">
                    <option value="" disabled>Select buyer</option>
                    {BUYERS.map((b) => (
                      <option key={b.code} value={b.code}>{b.code} · {b.name} ({b.purchaseOrg})</option>
                    ))}
                  </select>
                </label>
              )}

              {sel.level === 'Merchandise Category' && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge status="info" size="sm">Temp zone: {sel.tempZone}</Badge>
                  {sel.perishable && <Badge status="warning" size="sm">Perishable · FEFO enforced</Badge>}
                </div>
              )}

              {adding && (
                <div className="p-3 rounded-lg border border-[#D0D5DD] bg-[#F9FAFB] space-y-2">
                  <div className="text-xs font-semibold text-[#101828]">New node under {adding.parent}</div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={adding.code} onChange={(e) => setAdding({ ...adding, code: e.target.value })} placeholder="Code" className="border border-[#D0D5DD] rounded-lg px-2 py-1.5 text-xs font-mono sm:w-28" />
                    <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Name" className="border border-[#D0D5DD] rounded-lg px-2 py-1.5 text-xs flex-1" />
                    <button onClick={addNode} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#14706B] text-white">Create</button>
                    <button onClick={() => setAdding(null)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#D0D5DD] bg-white">Cancel</button>
                  </div>
                </div>
              )}

              {children(sel.code).length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#667085] border-b border-[#EAECF0]">
                      <th className="py-2 text-start font-semibold">Child</th>
                      <th className="py-2 text-start font-semibold">Buyer</th>
                      <th className="py-2 text-end font-semibold">SKUs</th>
                      <th className="py-2 text-end font-semibold">Sales 30d</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAECF0]">
                    {children(sel.code).map((c) => (
                      <tr key={c.code} className="cursor-pointer hover:bg-[#F9FAFB]" onClick={() => setSelected(c.code)}>
                        <td className="py-2"><span className="font-mono text-[#667085]">{c.code}</span> {c.name}</td>
                        <td className="py-2 text-[#475467]">{BUYERS.find((b) => b.code === c.buyer)?.name ?? '—'}</td>
                        <td className="py-2 text-end font-mono">{rollup[c.code]?.sku ?? 0}</td>
                        <td className="py-2 text-end font-mono">{eur(rollup[c.code]?.sales ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="text-xs text-[#667085]">Select a node in the hierarchy.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="op-card bg-white p-4">
          <h3 className="text-xs font-semibold text-[#101828] uppercase tracking-wider mb-2">Sales vs stock value by department (EUR)</h3>
          <BarChart
            ariaLabel="Sales and stock value by department"
            labels={deptChart.map((d) => d.name)}
            series={[{ name: 'Sales 30d', values: deptChart.map((d) => d.sales) }, { name: 'Stock value', values: deptChart.map((d) => d.value) }]}
          />
        </div>
        <div className="op-card bg-white p-4">
          <h3 className="text-xs font-semibold text-[#101828] uppercase tracking-wider mb-3">Stock value share by department</h3>
          <DonutChart ariaLabel="Stock value share by department" centerLabel="EUR stock" slices={deptChart.map((d) => ({ name: d.name, value: d.value }))} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-[#F9FAFB] border border-[#EAECF0]">
      <div className="text-[11px] text-[#667085]">{label}</div>
      <div className="text-sm font-bold text-[#101828] font-mono">{value}</div>
    </div>
  );
}
