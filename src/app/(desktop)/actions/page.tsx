'use client';

// /src/app/(desktop)/actions/page.tsx
// SmartStock Experience RC1 — Flagship Operational Exception Command Center

import React, { useState, useMemo } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useToast } from '@/hooks/useToast';
import { FilterBar, FilterOption } from '@/components/ui/FilterBar';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { ActionCard, ActionItem } from '@/components/domain/ActionCard';
import { InventoryConfidenceBar } from '@/components/domain/InventoryConfidenceBar';
import { InventoryPosition } from '@/components/domain/InventoryPosition';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActionImpactModal, ActionImpactData } from '@/components/domain/ActionImpactModal';
import { SavedViewsSelector, SavedView } from '@/components/domain/SavedViewsSelector';
import { CaseTimeline } from '@/components/domain/CaseTimeline';
import { NetworkPositionMatrix } from '@/components/domain/NetworkPositionMatrix';
import { UXTelemetry } from '@/lib/telemetry';
import {
  Truck, Check, RefreshCw, ClipboardList, ShieldAlert, ArrowUpDown,
  AlertTriangle, Clock, User, ArrowRight, Sparkles, AlertCircle
} from 'lucide-react';

interface ExtendedActionItem extends ActionItem {
  version: number;
  assignedTo?: string;
  isAssignedToMe?: boolean;
  needsMyApproval?: boolean;
  priorityScore: number;
  priorityReasons: string[];
  lastUpdated: string;
}

export default function ActionsPage() {
  const { activeStoreId } = useStoreContext();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [activeSavedView, setActiveSavedView] = useState('view-all');
  const [selectedAction, setSelectedAction] = useState<ExtendedActionItem | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [impactModalData, setImpactModalData] = useState<ActionImpactData | null>(null);
  const [isStaleDataDetected, setIsStaleDataDetected] = useState(false);
  const [hasNewBackgroundUpdates, setHasNewBackgroundUpdates] = useState(false);

  const sampleActions: ExtendedActionItem[] = [
    {
      id: 'act-01',
      version: 1,
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
      assignedTo: 'Sarah (Store Manager)',
      isAssignedToMe: true,
      needsMyApproval: true,
      priorityScore: 96,
      lastUpdated: '8s ago',
      priorityReasons: [
        'Stockout imminent in 2h 18m at sales velocity 0.8 units/hr',
        '€1,120 estimated weekend revenue exposure',
        'High-confidence digital twin projection (92%)',
        'Surplus inventory identified at sister store (Amsterdam Zuid)',
      ],
      recommendedAction: 'Transfer 12 units from Amsterdam Zuid',
      recommendationReason: 'Stockout expected in 2h 18m at current sales velocity.',
      whyThisRecommendation: [
        'Amsterdam Central expected to stock out in 2h 18m',
        'Amsterdam Zuid has 3.8 days of surplus inventory (36 units)',
        'Internal STO transfer arrives in 1h 20m vs 3 days for vendor PO',
        'Avoids estimated €1,120 in lost weekend sales',
      ],
    },
    {
      id: 'act-02',
      version: 2,
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
      assignedTo: 'Mia Johnson',
      isAssignedToMe: false,
      needsMyApproval: true,
      priorityScore: 91,
      lastUpdated: '14s ago',
      priorityReasons: [
        'High-velocity promotion active (+28% demand uplift)',
        'Sellable stock below safety buffer threshold',
        'Moerdijk DC holds 140 units surplus buffer available',
      ],
      recommendedAction: 'Emergency STO from Moerdijk Distribution Center',
      recommendationReason: '12 units sellable remaining. High velocity promo uplift active.',
      whyThisRecommendation: [
        'Runout horizon is 0.6 days at velocity 18.5 cases/day',
        'Moerdijk DC has 140 units surplus buffer available',
        'Batch STO transmission queued for next SAP dispatch window',
      ],
    },
    {
      id: 'act-03',
      version: 1,
      sku: 'MAT-00918',
      productName: 'Extra Virgin Olive Oil 1L',
      category: 'FMCG',
      storeName: 'Amsterdam Central',
      caseType: 'INVENTORY_UNCERTAINTY',
      severity: 'HIGH',
      exposure: 85.5,
      dueIn: '6h 00m',
      confidence: 43,
      sellableQty: 18,
      sapQty: 19,
      assignedTo: 'Unassigned',
      isAssignedToMe: false,
      needsMyApproval: false,
      priorityScore: 78,
      lastUpdated: '2m ago',
      priorityReasons: [
        'Inventory confidence dropped to 43%',
        'Unexplained 1-unit variance between SAP checkpoint and twin',
        'Physical verification needed before automated replenishment',
      ],
      recommendedAction: 'Assign Physical Verification Count to Floor Staff',
      recommendationReason: 'Inventory confidence dropped to 43% due to unexplained 1-unit checkpoint variance.',
      whyThisRecommendation: [
        'Expected physical stock is 18 vs SAP 19',
        'Last physical cycle count conducted 11 days ago',
        'Physical count task queued for Floor Staff PWA',
      ],
    },
    {
      id: 'act-04',
      version: 1,
      sku: 'MAT-33104',
      productName: 'Organic Greek Yogurt 500g',
      category: 'PERISHABLES',
      storeName: 'Amsterdam Central',
      caseType: 'EXPIRY_RISK',
      severity: 'HIGH',
      exposure: 220,
      dueIn: '8h 30m',
      confidence: 98,
      sellableQty: 24,
      sapQty: 24,
      assignedTo: 'Mia Johnson',
      isAssignedToMe: false,
      needsMyApproval: false,
      priorityScore: 74,
      lastUpdated: '5m ago',
      priorityReasons: [
        'Batch EXP-2026-08 reaches expiry horizon in 2 days',
        'Current velocity projects 14 units unsold by expiry date',
        'Applying 25% markdown recovers €165 gross margin',
      ],
      recommendedAction: 'Apply 25% FEFO Markdown Sticker',
      recommendationReason: 'Batch EXP-2026-08-25 reaches expiry horizon in 2 days.',
      whyThisRecommendation: [
        'Current sell-through rate projects 14 units unsold by expiry',
        '25% markdown proven to double velocity and recover margin',
      ],
    },
  ];

  const filterOptions: FilterOption[] = [
    { id: 'ALL', label: 'All Actions', count: sampleActions.length },
    { id: 'MY_WORK', label: 'My Work', count: sampleActions.filter((a) => a.isAssignedToMe).length },
    { id: 'APPROVAL', label: 'Needs My Approval', count: sampleActions.filter((a) => a.needsMyApproval).length },
    { id: 'UNASSIGNED', label: 'Unassigned', count: sampleActions.filter((a) => a.assignedTo === 'Unassigned').length },
    { id: 'CRITICAL', label: 'Critical Only', count: sampleActions.filter((a) => a.severity === 'CRITICAL').length },
  ];

  const filteredActions = useMemo(() => {
    return sampleActions.filter((a) => {
      if (activeFilter === 'MY_WORK') return a.isAssignedToMe;
      if (activeFilter === 'APPROVAL') return a.needsMyApproval;
      if (activeFilter === 'UNASSIGNED') return a.assignedTo === 'Unassigned';
      if (activeFilter === 'CRITICAL') return a.severity === 'CRITICAL';
      return true;
    });
  }, [sampleActions, activeFilter]);

  const handleReviewAction = (action: ExtendedActionItem) => {
    setSelectedAction(action);
    setIsStaleDataDetected(false);
    UXTelemetry.track('action_opened', { sku: action.sku, caseId: action.id });
  };

  const handleTriggerApproval = (action: ExtendedActionItem) => {
    // If Tier 3 Enterprise Action (e.g. inventory variance or physical adjustment), show Impact Modal
    if (action.caseType === 'INVENTORY_UNCERTAINTY' || action.caseType === 'SAP_VARIANCE') {
      setImpactModalData({
        title: 'Approve Physical Inventory Adjustment',
        sku: action.sku,
        productName: action.productName,
        storeName: action.storeName,
        currentSystemQty: action.sapQty,
        newTargetQty: action.sellableQty,
        deltaQty: action.sellableQty - action.sapQty,
        unitValue: 85.5,
        totalFinancialImpact: action.exposure,
        reason: 'Physical count variance reconciliation',
        erpActionType: 'INVENTORY_ADJUSTMENT',
      });
      return;
    }

    // Direct operational approval (Tier 2)
    setIsApproving(true);
    setTimeout(() => {
      setIsApproving(false);
      const title = action.recommendedAction;
      setSelectedAction(null);
      UXTelemetry.track('action_approved', { sku: action.sku, caseId: action.id });
      toast({
        type: 'success',
        title: 'Transfer Approved & Queued',
        description: `${title} has been logged and queued for SAP STO transmission.`,
      });
    }, 700);
  };

  const handleSimulateStaleData = () => {
    if (!selectedAction) return;
    setIsStaleDataDetected(true);
    UXTelemetry.track('stale_action_blocked', { sku: selectedAction.sku, caseId: selectedAction.id });
  };

  return (
    <div className="space-y-6">
      {/* ── HEADER & SAVED VIEWS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E4E7EC] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#101828] tracking-tight">Operational Actions</h1>
            <span className="text-[11px] font-mono text-[#667085]">Updated 6s ago</span>
          </div>
          <p className="text-xs text-[#475467] mt-0.5">
            Prioritized exception queue · Store {activeStoreId || '1001'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SavedViewsSelector
            activeViewId={activeSavedView}
            onSelectView={(v) => {
              setActiveSavedView(v.id);
              setActiveFilter(v.filterKey);
            }}
          />
        </div>
      </div>

      {/* ── NON-DISRUPTIVE LIVE UPDATE BANNER ── */}
      {hasNewBackgroundUpdates && (
        <div className="p-3 bg-[#EFF8FF] border border-[#B2DDFF] rounded-[6px] flex items-center justify-between text-xs text-[#175CD3] animate-in fade-in-0 duration-140">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#1570EF]" />
            <span><strong>3 new updates available</strong> from POS stream & SAP checkpoints.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setHasNewBackgroundUpdates(false)}>
            Refresh View
          </Button>
        </div>
      )}

      {/* ── WORK QUEUE FILTER BAR ── */}
      <FilterBar options={filterOptions} activeId={activeFilter} onChange={setActiveFilter} />

      {/* ── ACTION LIST ── */}
      <div className="space-y-2.5">
        {filteredActions.length === 0 ? (
          <EmptyState
            title="Zero Actions in this Queue"
            description="No unresolved exceptions match the active work filter."
            isSuccess={true}
          />
        ) : (
          filteredActions.map((action) => (
            <ActionCard key={action.id} action={action} onReview={() => handleReviewAction(action)} />
          ))
        )}
      </div>

      {/* ── ACTION DETAIL DRAWER ── */}
      {selectedAction && (
        <Drawer
          isOpen={Boolean(selectedAction)}
          onClose={() => setSelectedAction(null)}
          title={selectedAction.productName}
          subtitle={`SKU: ${selectedAction.sku} · Store ${selectedAction.storeName}`}
          badge={
            <Badge status={selectedAction.severity === 'CRITICAL' ? 'critical' : 'degraded'} size="sm">
              {selectedAction.severity}
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
                disabled={isStaleDataDetected}
                isLoading={isApproving}
                onClick={() => handleTriggerApproval(selectedAction)}
                leftIcon={<Check className="w-4 h-4" />}
              >
                {isStaleDataDetected ? 'Approval Blocked (Stale Data)' : 'Approve Recommendation'}
              </Button>
            </>
          }
        >
          <div className="space-y-6">
            {/* ── STALE DATA WARNING BANNER ── */}
            {isStaleDataDetected && (
              <div className="p-4 rounded-[6px] bg-[#FEF3F2] border border-[#FECDCA] space-y-2 text-xs text-[#B42318] animate-in fade-in-0">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <AlertCircle className="w-4 h-4 text-[#D92D20]" />
                  <span>Inventory changed during your review</span>
                </div>
                <p>
                  Previous Sellable: <strong>4 Units</strong> → Current Sellable: <strong>9 Units</strong> (via recent return).
                  The transfer recommendation has been recalculated.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsStaleDataDetected(false)}
                >
                  Review Recalculated Recommendation
                </Button>
              </div>
            )}

            {/* ── PRIORITIZATION RATIONALE (Why High Priority?) ── */}
            <div className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[#101828]">
                  Why is this Priority #{selectedAction.priorityScore}?
                </h4>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-[#FEF3F2] text-[#D92D20]">
                  Score {selectedAction.priorityScore} / 100
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-[#475467]">
                {selectedAction.priorityReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[#14706B] font-bold">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── OWNERSHIP & WORK QUEUE ── */}
            <div className="p-3 bg-white rounded-[6px] border border-[#EAECF0] flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 font-sans">
                <User className="w-3.5 h-3.5 text-[#667085]" />
                <span>Assigned: <strong className="text-[#101828]">{selectedAction.assignedTo}</strong></span>
              </div>
              <div className="flex items-center gap-1 text-[#667085]">
                <Clock className="w-3.5 h-3.5" />
                <span>Due in: <strong className="text-[#D92D20]">{selectedAction.dueIn}</strong></span>
              </div>
            </div>

            {/* ── OPERATIONAL POSITION MATRIX ── */}
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

            {/* ── NETWORK AVAILABILITY MATRIX ── */}
            <NetworkPositionMatrix sku={selectedAction.sku} productName={selectedAction.productName} />

            {/* ── RECOMMENDATION RATIONALE ── */}
            <div className="space-y-2 p-4 rounded-[6px] bg-[#E8F4F3] border border-[#14706B]/20">
              <h4 className="text-xs font-semibold text-[#14706B] uppercase tracking-wider">
                Recommended Action
              </h4>
              <p className="text-sm font-semibold text-[#101828]">{selectedAction.recommendedAction}</p>
            </div>

            {/* ── CONFIDENCE EXPLAINER ── */}
            <div className="p-4 rounded-[6px] border border-[#EAECF0] bg-white">
              <InventoryConfidenceBar score={selectedAction.confidence} showBreakdown={true} />
            </div>

            {/* ── FLAGSHIP COMPONENT: CASE LIFECYCLE TIMELINE ── */}
            <CaseTimeline
              caseId={selectedAction.id}
              sku={selectedAction.sku}
              productName={selectedAction.productName}
            />

            {/* Dev Helper to test Stale Data protection */}
            <div className="text-center pt-2">
              <button
                onClick={handleSimulateStaleData}
                className="text-[10px] text-[#98A2B3] hover:text-[#475467] underline"
              >
                [Simulate Digital Twin Mutation while in Drawer]
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {/* ── TIER 3 ACTION IMPACT SAFEGUARD MODAL ── */}
      {impactModalData && (
        <ActionImpactModal
          isOpen={Boolean(impactModalData)}
          onClose={() => setImpactModalData(null)}
          impactData={impactModalData}
          onConfirm={async () => {
            UXTelemetry.track('impact_modal_confirmed', { sku: impactModalData.sku });
            toast({
              type: 'success',
              title: 'Physical Adjustment Posted to SAP',
              description: `Material document queued for SKU ${impactModalData.sku} (${impactModalData.deltaQty} units).`,
            });
            setSelectedAction(null);
          }}
        />
      )}
    </div>
  );
}
