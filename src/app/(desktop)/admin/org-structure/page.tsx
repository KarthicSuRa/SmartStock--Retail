'use client';

// /src/app/(desktop)/admin/org-structure/page.tsx
// SmartStock — Enterprise org structure (SAP Retail aligned):
// Company Code (BUKRS) → Store/Plant (WERKS) · Sales Org (VKORG) · Distribution Channel (VTWEG)
// · Purchase Org (EKORG) · Buyers / Purchasing Groups (EKGRP) · Warehouse differentiator (LGNUM / LGORT).

import React, { useState } from 'react';
import { Building2, Network, ShoppingCart, Store, Truck, Users, Warehouse as WarehouseIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { PageHeader, RoleGuard } from '@/components/domain/RoleGuard';
import { BUYERS, COMPANY_CODES, DISTRIBUTION_CHANNELS, PURCHASE_ORGS, SALES_ORGS, STORES, WAREHOUSES, categoryStore } from '@/lib/master-data';
import { useI18n } from '@/lib/i18n';

const TABS = [
  { key: 'overview', label: 'Hierarchy', icon: Network },
  { key: 'stores', label: 'Stores / Plants', icon: Store },
  { key: 'sales', label: 'Sales Org & Channels', icon: ShoppingCart },
  { key: 'purchasing', label: 'Purchase Org & Buyers', icon: Users },
  { key: 'warehouses', label: 'Warehouses', icon: WarehouseIcon },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const th = 'py-2.5 px-3 font-semibold text-start';
const td = 'py-2.5 px-3';

export default function OrgStructurePage() {
  return (
    <RoleGuard module="org">
      <OrgInner />
    </RoleGuard>
  );
}

function OrgInner() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [cats] = categoryStore.useStore();
  const { t } = useI18n();
  const chName = (c: string) => DISTRIBUTION_CHANNELS.find((d) => d.code === c)?.name ?? c;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Org Structure')}
        subtitle="Company codes, stores/plants, sales organizations, distribution (sales) channels, purchase organizations, buyers and warehouse differentiators — the backbone for authorizations, reporting and SAP postings."
        badge={<Badge status="healthy" size="sm">SAP S/4HANA Retail aligned</Badge>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          ['Company codes', COMPANY_CODES.length, Building2],
          ['Stores / plants', STORES.length, Store],
          ['Sales orgs', SALES_ORGS.length, ShoppingCart],
          ['Dist. channels', DISTRIBUTION_CHANNELS.length, Truck],
          ['Purchase orgs', PURCHASE_ORGS.length, Users],
          ['Buyers', BUYERS.length, Users],
        ].map(([label, n, Icon]) => {
          const I = Icon as React.ElementType;
          return (
            <div key={label as string} className="op-card bg-white p-3">
              <div className="text-[11px] text-[#667085] flex items-center gap-1.5"><I className="w-3.5 h-3.5" /> {label as string}</div>
              <div className="text-xl font-bold text-[#101828]">{n as number}</div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[#E4E7EC] pb-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${tab === key ? 'bg-[#14706B] text-white font-semibold' : 'text-[#475467] hover:bg-[#F2F4F7]'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {COMPANY_CODES.map((cc) => (
            <div key={cc.code} className="op-card bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-[11px] text-[#14706B] font-bold">COMPANY CODE {cc.code}</div>
                  <div className="text-sm font-bold text-[#101828]">{cc.name}</div>
                </div>
                <Badge status="neutral" size="sm">{cc.country} · {cc.currency}</Badge>
              </div>
              <TreeBlock title="Sales organizations → distribution channels">
                {SALES_ORGS.filter((s) => s.companyCode === cc.code).map((s) => (
                  <TreeItem key={s.code} code={s.code} name={s.name}>
                    {s.channels.map((c) => <Chip key={c}>{c} · {chName(c)}</Chip>)}
                  </TreeItem>
                ))}
              </TreeBlock>
              <TreeBlock title="Purchase organizations → buyers">
                {PURCHASE_ORGS.filter((p) => p.companyCode === cc.code || p.companyCode === null).map((p) => (
                  <TreeItem key={p.code} code={p.code} name={`${p.name} (${p.scope})`}>
                    {BUYERS.filter((b) => b.purchaseOrg === p.code).map((b) => <Chip key={b.code}>{b.code} · {b.name}</Chip>)}
                  </TreeItem>
                ))}
              </TreeBlock>
              <TreeBlock title="Stores / plants → warehouse">
                {STORES.filter((s) => s.companyCode === cc.code).map((s) => {
                  const wh = WAREHOUSES.find((w) => w.plant === s.code);
                  return (
                    <TreeItem key={s.code} code={s.code} name={`${s.name} · ${s.format}`}>
                      {wh ? <Chip>{wh.code} · {wh.differentiator}</Chip> : <Chip>supplied by {s.supplyingSite}</Chip>}
                    </TreeItem>
                  );
                })}
              </TreeBlock>
            </div>
          ))}
        </div>
      )}

      {tab === 'stores' && (
        <Table
          title="Stores & Plant Assignments"
          rows={STORES}
          cols={[
            ['Plant', (s) => s.code],
            ['Name', (s) => s.name],
            ['City', (s) => s.city],
            ['Format', (s) => s.format],
            ['Company code', (s) => s.companyCode],
            ['Sales org', (s) => s.salesOrg],
            ['Purchase org', (s) => s.purchaseOrg],
            ['Channels', (s) => s.channels.map(chName).join(', ')],
            ['Supplying site', (s) => s.supplyingSite],
            ['Manager', (s) => s.manager],
          ]}
        />
      )}

      {tab === 'sales' && (
        <div className="space-y-4">
          <Table
            title="Sales Organizations"
            rows={SALES_ORGS}
            cols={[
              ['Sales org', (s) => s.code],
              ['Name', (s) => s.name],
              ['Company code', (s) => s.companyCode],
              ['Distribution channels', (s) => s.channels.map((c) => `${c} ${chName(c)}`).join(', ')],
              ['Stores', (s) => STORES.filter((x) => x.salesOrg === s.code).map((x) => x.code).join(', ')],
            ]}
          />
          <Table
            title="Distribution Channels (Sales Channels)"
            rows={DISTRIBUTION_CHANNELS}
            cols={[
              ['Channel', (d) => d.code],
              ['Name', (d) => d.name],
              ['Description', (d) => d.description],
              ['Used by stores', (d) => STORES.filter((s) => s.channels.includes(d.code)).length],
            ]}
          />
        </div>
      )}

      {tab === 'purchasing' && (
        <div className="space-y-4">
          <Table
            title="Purchase Organizations"
            rows={PURCHASE_ORGS}
            cols={[
              ['Purchase org', (p) => p.code],
              ['Name', (p) => p.name],
              ['Scope', (p) => p.scope],
              ['Company code', (p) => p.companyCode ?? 'All (cross-company)'],
              ['Buyers', (p) => BUYERS.filter((b) => b.purchaseOrg === p.code).length],
            ]}
          />
          <Table
            title="Buyers List (Purchasing Groups)"
            rows={BUYERS}
            cols={[
              ['Buyer code', (b) => b.code],
              ['Name', (b) => b.name],
              ['Email', (b) => b.email],
              ['Purchase org', (b) => b.purchaseOrg],
              ['Categories', (b) => b.categories.map((c) => `${c} ${cats.find((n) => n.code === c)?.name ?? ''}`).join(', ')],
              ['PO approval limit', (b) => `${b.currency} ${b.poLimit.toLocaleString()}`],
            ]}
          />
        </div>
      )}

      {tab === 'warehouses' && (
        <div className="space-y-4">
          <div className="op-card bg-white p-4 text-xs text-[#475467] space-y-1">
            <div className="font-semibold text-[#101828]">Warehouse differentiator</div>
            <p><b>EWM (bin-managed)</b> — full bin-level stock, putaway & picking strategies (DCs). <b>Lean WM</b> — fixed bins without transfer orders (store back-stores, dark stores). <b>IM (location only)</b> — stock by storage location only, no bins.</p>
          </div>
          <Table
            title="Warehouses & Storage Locations"
            rows={WAREHOUSES}
            cols={[
              ['Warehouse', (w) => w.code],
              ['Name', (w) => w.name],
              ['Type', (w) => w.type],
              ['Differentiator', (w) => w.differentiator],
              ['Plant', (w) => w.plant],
              ['Storage locations', (w) => w.storageLocations.map((l) => `${l.code} ${l.name}`).join(', ')],
            ]}
          />
        </div>
      )}
    </div>
  );
}

function TreeBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold text-[#667085] uppercase">{title}</div>
      <div className="border-s-2 border-[#E8F4F3] ps-3 space-y-1.5">{children}</div>
    </div>
  );
}

function TreeItem({ code, name, children }: { code: string; name: string; children?: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="font-mono font-bold text-[#14706B]">{code}</span> <span className="text-[#101828]">{name}</span>
      <div className="flex flex-wrap gap-1 mt-1">{children}</div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F2F4F7] text-[#475467] border border-[#EAECF0]">{children}</span>;
}

function Table<T>({ title, rows, cols }: { title: string; rows: T[]; cols: [string, (r: T) => string | number][] }) {
  return (
    <div className="op-card bg-white overflow-hidden">
      <div className="p-4 border-b border-[#EAECF0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider">{title} ({rows.length})</h2>
        <ExportMenu title={title} module="org" rows={rows} columns={cols.map(([header, value]) => ({ header, value }))} landscape />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-[#EAECF0] bg-[#F9FAFB] text-[#667085]">
              {cols.map(([h]) => <th key={h} className={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAECF0]">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-[#F9FAFB]">
                {cols.map(([h, v], ci) => (
                  <td key={h} className={`${td} ${ci === 0 ? 'font-mono font-bold text-[#14706B]' : 'text-[#344054]'}`}>{v(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
