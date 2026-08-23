'use client';

// /src/app/(desktop)/home/page.tsx
// SmartStock Experience RC1 — Progressive Severity Operational Home

import React, { useState } from 'react';
import Link from 'next/link';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useToast } from '@/hooks/useToast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ActionCard, ActionItem } from '@/components/domain/ActionCard';
import { InventoryConfidenceBar } from '@/components/domain/InventoryConfidenceBar';
import { InventoryPosition } from '@/components/domain/InventoryPosition';
import { CaseTimeline } from '@/components/domain/CaseTimeline';
import { NetworkPositionMatrix } from '@/components/domain/NetworkPositionMatrix';
import { UXTelemetry } from '@/lib/telemetry';
import { ArrowRight, CheckCircle2, RefreshCw, Truck, ShieldCheck, Zap, Clock, AlertCircle } from 'lucide-react';

export default function HomePage() {
  const { activeStoreId } = useStoreContext();
  const { toast } = useToast();
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const sampleCriticalActions: ActionItem[] = [
    {
      id: 'act-01',
      sku: 'AP-PRO-USB-C',
      productName: 'AirPods Pro (USB-C MagSafe)',
      category: 'HIGH_VALUE',
      storeName: 'Amsterdam Central',
      caseType: 'STOCKOUT_RISK',
      severity: 'CRITICAL',
      exposure: 1120,
      dueIn: '2h 18m',
      confidence: 92,
      sellableQty: 4,
      sapQty: 5,
      recommendedAction: 'Transfer 12 units from Amsterdam Zuid',
      recommendationReason: 'Stockout expected in 2h 18m at sales velocity 0.8 units/hr.',
      whyThisRecommendation: [
        'Amsterdam Central expected to stock out in 2h 18m',
        'Amsterdam Zuid has 3.8 days of surplus inventory (36 units)',
        'Internal STO transfer arrives in 1h 20m vs 3 days for vendor PO',
        'Avoids estimated €1,120 in lost weekend sales',
      ],
    },
    {
      id: 'act-02',
      sku: 'SKU-DRINK-001',
      productName: 'Coca Cola Zero 330ml Can (24 Pack)',
      category: 'FMCG',
      storeName: 'Amsterdam Central',
      caseType: 'STOCKOUT_RISK',
      severity: 'CRITICAL',
      exposure: 480,
      dueIn: '3h 40m',
      confidence: 95,
      sellableQty: 12,
      sapQty: 120,
      recommendedAction: 'Emergency STO from Moerdijk Distribution Center',
      recommendationReason: '12 units sellable remaining. High velocity promo uplift active.',
      whyThisRecommendation: [
        'Runout horizon is 0.6 days at velocity 18.5 cases/day',
        'Moerdijk DC has 140 units surplus buffer available',
        'Batch STO transmission queued for next SAP dispatch window',
      ],
    },
  ];

  const handleApprove = async () => {
    if (!selectedAction) return;
    setIsApproving(true);

    setTimeout(() => {
      setIsApproving(false);
      const sku = selectedAction.sku;
      setSelectedAction(null);
      UXTelemetry.track('action_approved', { sku, caseId: selectedAction.id });
      toast({
        type: 'success',
        title: 'Transfer Approved & Queued for SAP',
        description: `STO for ${sku} queued for OData batch transmission to SAP S/4HANA.`,
      });
    }, 750);
  };

  return (
    <div className="space-y-6">
      {/* ── LEVEL 1: NEEDS ATTENTION ── */}
      <div className="op-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge status="healthy" size="sm">
              Live Digital Twin Active
            </Badge>
            <span className="text-xs text-[#667085]">Store {activeStoreId || '1001'}</span>
            <span className="text-[11px] font-mono text-[#667085] hidden sm:inline">· Updated 4s ago</span>
          </div>
          <h1 className="text-xl font-semibold text-[#101828] tracking-tight">
            Good morning, Sarah
          </h1>
          <p className="text-xs text-[#475467]">
            <strong className="text-[#101828]">12 actions</strong> need attention today ·{' '}
            <strong className="text-[#D92D20] font-mono">€4,820</strong> estimated sales exposure at risk.
          </p>
        </div>

        <Link href="/actions">
          <Button variant="primary" size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
            View All 12 Actions
          </Button>
        </Link>
      </div>

      {/* Critical Exceptions List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#101828] flex items-center gap-2">
            <span>Critical Exceptions</span>
            <span className="text-xs font-mono text-[#667085] font-normal">(Top 2 Priority)</span>
          </h2>
          <Link href="/actions" className="text-xs font-medium text-[#14706B] hover:underline">
            See all exceptions →
          </Link>
        </div>

        <div className="space-y-2.5">
          {sampleCriticalActions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onReview={(act) => {
                setSelectedAction(act);
                UXTelemetry.track('action_opened', { sku: act.sku, caseId: act.id });
              }}
            />
          ))}
        </div>
      </div>

      {/* ── LEVEL 2: TODAY'S OPERATIONS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Operations Overview Card */}
        <div className="op-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#667085]">
              Today's Operations
            </h3>
            <span className="text-[11px] font-mono text-[#667085]">Daily Shift</span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center font-mono">
            <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
              <span className="text-[11px] font-sans text-[#667085] block">Inventory Reconciled</span>
              <span className="text-lg font-bold text-[#101828]">98.4%</span>
            </div>
            <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
              <span className="text-[11px] font-sans text-[#667085] block">Average Confidence</span>
              <span className="text-lg font-bold text-[#039855]">91%</span>
            </div>
            <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
              <span className="text-[11px] font-sans text-[#667085] block">Stockout Risks</span>
              <span className="text-lg font-bold text-[#D92D20]">7</span>
            </div>
            <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
              <span className="text-[11px] font-sans text-[#667085] block">Tasks Completed</span>
              <span className="text-lg font-bold text-[#101828]">41 / 48</span>
            </div>
          </div>
        </div>

        {/* Integration Status Card */}
        <div className="op-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#667085]">
              Integration Health
            </h3>
            <span className="text-[11px] font-mono text-[#667085]">Continuous Feeds</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#039855]" />
                <div>
                  <p className="font-semibold text-[#101828]">SAP S/4HANA OData Engine</p>
                  <p className="text-[11px] text-[#667085]">Last reconciled 8 min ago · Zero pending errors</p>
                </div>
              </div>
              <Badge status="healthy" size="sm">
                Healthy
              </Badge>
            </div>

            <div className="p-3 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Zap className="w-4 h-4 text-[#039855]" />
                <div>
                  <p className="font-semibold text-[#101828]">Universal POS Gateway</p>
                  <p className="text-[11px] text-[#667085]">3 Live Feeds active · Avg lag 1.4s</p>
                </div>
              </div>
              <Badge status="healthy" size="sm">
                99% Feed Quality
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ── LEVEL 3: TRENDS & ANALYTICS LINK ── */}
      <div className="op-card p-4 bg-white flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-[#475467]">
          <Clock className="w-4 h-4 text-[#14706B]" />
          <span>Looking for 12-week inventory accuracy or shrink trajectory?</span>
        </div>
        <Link href="/insights" className="font-semibold text-[#14706B] hover:underline flex items-center gap-1">
          <span>View Trends & Insights</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ── DETAIL DRAWER ── */}
      {selectedAction && (
        <Drawer
          isOpen={Boolean(selectedAction)}
          onClose={() => setSelectedAction(null)}
          title={selectedAction.productName}
          subtitle={`SKU: ${selectedAction.sku} · Store ${selectedAction.storeName}`}
          badge={
            <Badge status="critical" size="sm">
              Stockout Risk
            </Badge>
          }
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setSelectedAction(null)}>
                Dismiss
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isApproving}
                onClick={handleApprove}
                leftIcon={<Truck className="w-4 h-4" />}
              >
                Approve Transfer (12 units)
              </Button>
            </>
          }
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-[#667085]">Operational Inventory</h4>
              <InventoryPosition
                sellable={selectedAction.sellableQty}
                onHand={selectedAction.sellableQty + 1}
                reserved={1}
                inTransit={12}
                sapRecorded={selectedAction.sapQty}
              />
            </div>

            <NetworkPositionMatrix sku={selectedAction.sku} productName={selectedAction.productName} />

            <div className="space-y-2 p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0]">
              <h4 className="text-xs font-semibold text-[#101828]">Why this recommendation?</h4>
              <ul className="space-y-1.5 text-xs text-[#475467]">
                {selectedAction.whyThisRecommendation?.map((point, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[#14706B] font-bold">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-[6px] border border-[#EAECF0] bg-white">
              <InventoryConfidenceBar score={selectedAction.confidence} showBreakdown={true} />
            </div>

            <CaseTimeline
              caseId={selectedAction.id}
              sku={selectedAction.sku}
              productName={selectedAction.productName}
            />
          </div>
        </Drawer>
      )}
    </div>
  );
}
