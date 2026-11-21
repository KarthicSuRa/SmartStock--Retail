'use client';

// /src/app/(desktop)/glossary/page.tsx
// SmartStock — Terminology glossary (retail, SAP, inventory & system terms).

import React, { useMemo, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { PageHeader } from '@/components/domain/RoleGuard';
import { useI18n } from '@/lib/i18n';

type Domain = 'Org Structure' | 'Master Data' | 'Inventory' | 'Store Operations' | 'Procurement' | 'Integration' | 'Analytics' | 'Security';

interface Term { term: string; abbr?: string; sap?: string; domain: Domain; definition: string; seeAlso?: string[] }

const TERMS: Term[] = [
  { term: 'Company Code', abbr: 'CC', sap: 'BUKRS', domain: 'Org Structure', definition: 'Smallest legal entity with its own balance sheet. Every store, purchase and posting belongs to exactly one company code.', seeAlso: ['Plant'] },
  { term: 'Plant / Store', sap: 'WERKS', domain: 'Org Structure', definition: 'Physical site that holds stock — a store, dark store or distribution centre. Inventory is always tracked per plant.', seeAlso: ['Storage Location'] },
  { term: 'Storage Location', sap: 'LGORT', domain: 'Org Structure', definition: 'Subdivision of a plant’s stock, e.g. 0001 sales floor, 0002 back-store, 0003 quarantine/damaged.', seeAlso: ['Bin'] },
  { term: 'Sales Organization', sap: 'VKORG', domain: 'Org Structure', definition: 'Unit responsible for selling goods and negotiating sales conditions; owned by one company code.' },
  { term: 'Distribution Channel', abbr: 'Sales channel', sap: 'VTWEG', domain: 'Org Structure', definition: 'Route through which goods reach the customer: store/retail, e-commerce, wholesale, click & collect.' },
  { term: 'Purchase Organization', sap: 'EKORG', domain: 'Org Structure', definition: 'Unit that negotiates purchasing conditions with vendors. Can be central, local or cross-company.' },
  { term: 'Purchasing Group / Buyer', sap: 'EKGRP', domain: 'Org Structure', definition: 'Buyer or team responsible for specific merchandise categories; approves requisitions within a PO limit.' },
  { term: 'Warehouse Number', sap: 'LGNUM', domain: 'Org Structure', definition: 'Bin-managed warehouse. The warehouse differentiator says how stock is managed: EWM (bins & tasks), Lean WM (fixed bins) or IM (location only).' },
  { term: 'Merchandise Category', abbr: 'MC', sap: 'MATKL', domain: 'Master Data', definition: 'Lowest level of the product grouping (e.g. 101010 Milk). Drives buyer ownership, reporting and replenishment rules.', seeAlso: ['MC Hierarchy'] },
  { term: 'MC Hierarchy', sap: 'WWGHA', domain: 'Master Data', definition: 'Department → Category → Merchandise Category tree used to roll up sales, stock and margin.' },
  { term: 'SKU / Article', sap: 'MATNR', domain: 'Master Data', definition: 'A unique sellable item (one size/colour/pack). Identified internally by SKU and in SAP by material number.' },
  { term: 'EAN / GTIN', domain: 'Master Data', definition: 'Global barcode number printed on the product, scanned at POS and by the floor app.' },
  { term: 'Unit of Measure', abbr: 'UoM', sap: 'MEINS', domain: 'Master Data', definition: 'EA (each), PK (pack), CS (case), KG. Conversions are applied on receipt and sale.' },
  { term: 'Planogram', domain: 'Store Operations', definition: 'Defined shelf layout: which SKU goes where on the sales floor and with what capacity (facings × depth).' },
  { term: 'Shelf Location', domain: 'Store Operations', definition: 'Sales-floor position from the planogram, e.g. SF-03-B (aisle 3, bay B).' },
  { term: 'Back-Store', domain: 'Store Operations', definition: 'Store stock room holding reserve stock that is not yet on the sales floor.', seeAlso: ['Bin', 'Back-Store Mapping'] },
  { term: 'Bin', domain: 'Inventory', definition: 'Smallest addressable storage place, e.g. BS-A-01-02 = Back-store · Ambient zone · rack 01 · level 02.' },
  { term: 'Back-Store Mapping', domain: 'Inventory', definition: 'Link between a SKU’s shelf location and its back-store bin, with min-shelf trigger and capacities.' },
  { term: 'Bin Movement', domain: 'Inventory', definition: 'Transfer of stock between a bin and the shelf, or between bins (re-slotting). Logged with who/when/qty.' },
  { term: 'Shelf Replenishment', domain: 'Store Operations', definition: 'Moving stock from back-store to shelf when shelf quantity drops below the minimum shelf level.' },
  { term: 'Cycle Count', domain: 'Inventory', definition: 'Counting a subset of SKUs/bins on a rolling schedule instead of a full stock-take. Variances need approval.' },
  { term: 'Blind Count', domain: 'Inventory', definition: 'Count where the counter does not see the book quantity, to avoid bias.' },
  { term: 'Book Stock', domain: 'Inventory', definition: 'Quantity the system believes is on hand (ledger). Compared with physical count to compute variance.' },
  { term: 'Ghost Inventory', domain: 'Inventory', definition: 'Stock that exists in the system but not physically — causes hidden stockouts because no reorder is triggered.' },
  { term: 'FEFO', domain: 'Inventory', definition: 'First-Expired-First-Out: sell or move the batch with the earliest expiry date first.' },
  { term: 'On-Shelf Availability', abbr: 'OSA', domain: 'Analytics', definition: 'Percentage of time/SKUs that are available on the shelf for customers.' },
  { term: 'Stockout', domain: 'Analytics', definition: 'SKU unavailable to customers. May be a true stockout (no stock at all) or shelf-out (stock still in back-store).' },
  { term: 'Days of Cover', domain: 'Analytics', definition: 'Stock on hand divided by average daily sales — how many days current stock will last.' },
  { term: 'Safety Stock', domain: 'Procurement', definition: 'Buffer held to absorb demand and lead-time variability.' },
  { term: 'Reorder Point', abbr: 'ROP', domain: 'Procurement', definition: 'Stock level that triggers a replenishment order: demand during lead time + safety stock.' },
  { term: 'Purchase Requisition', abbr: 'PR', sap: 'BANF', domain: 'Procurement', definition: 'Internal request to buy; approved by a buyer/manager before becoming a purchase order.' },
  { term: 'Purchase Order', abbr: 'PO', sap: 'EBELN', domain: 'Procurement', definition: 'Legally binding order sent to a vendor.' },
  { term: 'Stock Transfer Order', abbr: 'STO', domain: 'Procurement', definition: 'Order moving stock between plants (DC → store or store → store).' },
  { term: 'Goods Receipt', abbr: 'GR', sap: 'MIGO 101', domain: 'Procurement', definition: 'Posting that increases stock when a delivery is received against a PO or STO.' },
  { term: 'ASN', domain: 'Procurement', definition: 'Advance Shipping Notice — supplier/DC message announcing an incoming delivery.' },
  { term: 'POS', domain: 'Integration', definition: 'Point-of-Sale system at the checkout. Sales events are streamed to SmartStock to decrement stock in near real-time.' },
  { term: 'OData', domain: 'Integration', definition: 'REST-based protocol used to read and post data to SAP S/4HANA.' },
  { term: 'Idempotency', domain: 'Integration', definition: 'Guarantee that re-sending the same transaction does not post it twice.' },
  { term: 'Dead-Letter Queue', abbr: 'DLQ', domain: 'Integration', definition: 'Holding area for transactions that failed after all retries; reviewed and replayed by an admin.' },
  { term: 'Quarantine', domain: 'Integration', definition: 'Isolation of malformed or suspicious inbound events before they reach the ledger.' },
  { term: 'Watermark', domain: 'Integration', definition: 'Last successfully processed position in a data feed, used to resume sync without gaps or duplicates.' },
  { term: 'Transaction Log', domain: 'Integration', definition: 'Record of every transaction’s outcome (success / warning / error) per module, with reference and message.' },
  { term: 'Audit Log', domain: 'Security', definition: 'Append-only record of who did what and when (logins, approvals, edits, role changes, exports).' },
  { term: 'RBAC', domain: 'Security', definition: 'Role-Based Access Control — permissions are granted to roles, and users get roles.' },
  { term: 'Authorization Matrix', domain: 'Security', definition: 'Grid of role × module × access level (none / view / edit / approve).' },
  { term: 'Separation of Duties', abbr: 'SoD', domain: 'Security', definition: 'Rule that the same person cannot both perform and approve a sensitive transaction (e.g. count and approve its variance).' },
  { term: 'RLS', domain: 'Security', definition: 'Row-Level Security in PostgreSQL/Supabase — the database only returns rows the user’s tenant/store is allowed to see.' },
  { term: 'Tenant', domain: 'Security', definition: 'One retailer’s isolated data space in the multi-tenant platform.' },
];

const DOMAINS: Domain[] = ['Org Structure', 'Master Data', 'Inventory', 'Store Operations', 'Procurement', 'Integration', 'Analytics', 'Security'];

export default function GlossaryPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<'all' | Domain>('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TERMS.filter((x) => (domain === 'all' || x.domain === domain) && (!q || [x.term, x.abbr ?? '', x.sap ?? '', x.definition].some((v) => v.toLowerCase().includes(q)))).sort((a, b) => a.term.localeCompare(b.term));
  }, [query, domain]);

  const letters = Array.from(new Set(rows.map((r) => r.term[0].toUpperCase())));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Glossary')}
        subtitle="Shared terminology for store teams, buyers, IT and auditors — with SAP field / transaction equivalents."
        badge={<Badge status="neutral" size="sm">{TERMS.length} terms</Badge>}
        actions={
          <ExportMenu
            title="SmartStock Glossary"
            module="reports"
            rows={rows}
            columns={[
              { header: 'Term', value: (r) => r.term },
              { header: 'Abbreviation', value: (r) => r.abbr ?? '' },
              { header: 'SAP', value: (r) => r.sap ?? '' },
              { header: 'Domain', value: (r) => r.domain },
              { header: 'Definition', value: (r) => r.definition },
            ]}
          />
        }
      />

      <div className="op-card bg-white p-3 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-[#98A2B3]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${t('Search')} — term, abbreviation, SAP code…`} className="ps-8 pe-3 py-2 border border-[#D0D5DD] rounded-lg text-xs w-full" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {(['all', ...DOMAINS] as const).map((d) => (
            <button key={d} onClick={() => setDomain(d)} className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${domain === d ? 'bg-[#14706B] text-white' : 'bg-[#F2F4F7] text-[#475467]'}`}>
              {d === 'all' ? t('All') : d}
            </button>
          ))}
        </div>
      </div>

      {letters.map((L) => (
        <section key={L} className="space-y-2">
          <h2 className="text-sm font-black text-[#14706B]">{L}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows.filter((r) => r.term[0].toUpperCase() === L).map((r) => (
              <article key={r.term} className="op-card bg-white p-4 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-[#14706B]" />
                  <h3 className="text-sm font-bold text-[#101828]">{r.term}</h3>
                  {r.abbr && <span className="text-[11px] font-mono text-[#475467]">({r.abbr})</span>}
                  {r.sap && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E8F4F3] text-[#14706B] font-bold">SAP {r.sap}</span>}
                  <Badge status="neutral" size="sm" showIcon={false}>{r.domain}</Badge>
                </div>
                <p className="text-xs text-[#475467] leading-relaxed">{r.definition}</p>
                {r.seeAlso && <p className="text-[11px] text-[#667085]">See also: {r.seeAlso.join(', ')}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
      {rows.length === 0 && <div className="op-card bg-white p-8 text-center text-xs text-[#667085]">No terms match “{query}”.</div>}
    </div>
  );
}
