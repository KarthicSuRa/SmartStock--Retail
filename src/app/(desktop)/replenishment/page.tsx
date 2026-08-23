'use client';

// /src/app/(desktop)/replenishment/page.tsx
// SmartStock Experience RC1 — Replenishment Decision Console with OUTCOME_UNKNOWN Recovery

import React, { useState } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { useToast } from '@/hooks/useToast';
import { RecommendationCard, ReplenishmentOption } from '@/components/domain/RecommendationCard';
import { ActionImpactModal, ActionImpactData } from '@/components/domain/ActionImpactModal';
import { NetworkPositionMatrix } from '@/components/domain/NetworkPositionMatrix';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { InventoryPosition } from '@/components/domain/InventoryPosition';
import { DecisionReasoningCard } from '@/components/domain/DecisionReasoningCard';
import { DecisionFeedbackModal } from '@/components/domain/DecisionFeedbackModal';
import { DecisionEngine } from '@/lib/decision/decision-engine';
import { DecisionRecommendation } from '@/lib/decision/types';
import { UXTelemetry } from '@/lib/telemetry';
import { Truck, Check, ArrowRight, RefreshCw, AlertTriangle, ShieldCheck, Clock, Sparkles } from 'lucide-react';

export default function ReplenishmentPage() {
  const { activeStoreId } = useStoreContext();
  const { toast } = useToast();
  const [selectedOptionId, setSelectedOptionId] = useState('opt-01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [impactModalData, setImpactModalData] = useState<ActionImpactData | null>(null);
  const [outcomeUnknownState, setOutcomeUnknownState] = useState<boolean>(false);
  const [confirmedStoDoc, setConfirmedStoDoc] = useState<string | null>(null);

  // Decision Intelligence RC1
  const [feedbackModalMode, setFeedbackModalMode] = useState<'MODIFY' | 'REJECT' | null>(null);
  const [recommendation, setRecommendation] = useState<DecisionRecommendation>(
    DecisionEngine.evaluateReplenishmentDecision(activeStoreId || '1001', 'AP-PRO-USB-C')
  );

  const options: ReplenishmentOption[] = [
    {
      id: 'opt-01',
      sourceType: 'INTERNAL_TRANSFER',
      sourceName: 'Store 1002 — Amsterdam Zuid',
      quantity: 12,
      estimatedArrival: '1h 20m (Today 13:40)',
      transferCost: 14,
      sourceRemainingDOS: 3.4,
      isRecommended: true,
      whyThisOption: [
        'Amsterdam Central expected to stock out in 2h 18m',
        'Amsterdam Zuid has 3.8 days of surplus inventory (36 units)',
        'Fastest delivery time — arrives before peak evening rush',
        'Avoids estimated €1,120 in lost sales',
      ],
    },
    {
      id: 'opt-02',
      sourceType: 'DC_REPLENISHMENT',
      sourceName: 'Moerdijk Central Distribution Center',
      quantity: 24,
      estimatedArrival: 'Tomorrow 09:00',
      transferCost: 22,
      sourceRemainingDOS: 18.0,
      isRecommended: false,
      whyThisOption: [
        'Overnight logistics window scheduled for 22:00',
        'Full case-pack fulfillment (24 units)',
        'Arrives after tonight’s projected 18:00 stockout',
      ],
    },
    {
      id: 'opt-03',
      sourceType: 'VENDOR_PO',
      sourceName: 'Apple Inc. Direct EDI B2B',
      quantity: 96,
      estimatedArrival: '3 Business Days',
      transferCost: 0,
      moq: 96,
      isRecommended: false,
      whyThisOption: [
        'Standard procurement lead time 72 hours',
        'Supplier Minimum Order Quantity (MOQ) is 96 units',
        'Creates temporary working capital overstock at store level',
      ],
    },
  ];

  const selected = options.find((o) => o.id === selectedOptionId) || options[0];

  const handleApprove = () => {
    // If Vendor PO (Tier 3), show ActionImpactModal
    if (selected.sourceType === 'VENDOR_PO') {
      setImpactModalData({
        title: 'Submit Vendor Purchase Order to SAP',
        sku: 'AP-PRO-USB-C',
        productName: 'AirPods Pro (USB-C MagSafe)',
        storeName: 'Amsterdam Central',
        currentSystemQty: 4,
        newTargetQty: 100,
        deltaQty: 96,
        unitValue: 180.0,
        totalFinancialImpact: 96 * 180.0,
        reason: 'Vendor Minimum Order Quantity (MOQ 96 units)',
        erpActionType: 'EMERGENCY_PO',
      });
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      UXTelemetry.track('recommendation_approved', {
        sku: 'AP-PRO-USB-C',
        metadata: { option: selected.id, type: selected.sourceType },
      });
      toast({
        type: 'success',
        title: 'Transfer Order Dispatched',
        description: `Transfer for 12 units of AirPods Pro from ${selected.sourceName} queued for SAP transmission.`,
      });
    }, 700);
  };

  const handleSimulateOutcomeUnknown = () => {
    setOutcomeUnknownState(true);
    setConfirmedStoDoc(null);

    // Auto-resolve after 2.5s
    setTimeout(() => {
      setOutcomeUnknownState(false);
      setConfirmedStoDoc('STO-4500019218');
      toast({
        type: 'success',
        title: 'SAP Transfer Confirmed',
        description: 'Document STO 4500019218 confirmed in S/4HANA document ledger.',
      });
    }, 2500);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ── OUTCOME_UNKNOWN RECOVERY BANNER ── */}
      {outcomeUnknownState && (
        <div className="p-4 rounded-[8px] bg-[#FEF6EE] border border-[#FEDF89] space-y-2 text-xs text-[#B54708] animate-in fade-in-0">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <RefreshCw className="w-4 h-4 text-[#DC6803] animate-spin" />
            <span>SAP confirmation pending</span>
          </div>
          <p>
            SAP S/4HANA may have received this transfer order, but the network response was interrupted. SmartStock is actively verifying the document ledger before attempting another submission. <strong>Do not resubmit manually.</strong>
          </p>
        </div>
      )}

      {/* Confirmed Notice */}
      {confirmedStoDoc && (
        <div className="p-4 rounded-[8px] bg-[#EDFDF5] border border-[#A6F4C5] flex items-center justify-between text-xs text-[#027A48]">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="w-5 h-5 text-[#039855]" />
            <span>SAP Transfer Document Confirmed: <strong className="font-mono">{confirmedStoDoc}</strong></span>
          </div>
          <Badge status="completed" size="sm">Confirmed in SAP</Badge>
        </div>
      )}

      {/* Header */}
      <div className="op-card p-6 bg-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge status="critical" size="sm">
              Stockout Risk in 2h 18m
            </Badge>
            <span className="text-xs text-[#667085]">Store {activeStoreId || '1001'}</span>
          </div>
          <h1 className="text-xl font-semibold text-[#101828] tracking-tight">
            AirPods Pro (USB-C MagSafe)
          </h1>
          <div className="flex items-center gap-3 text-xs text-[#475467]">
            <span>SKU: <strong className="font-mono text-[#101828]">AP-PRO-USB-C</strong></span>
            <span>Needed: <strong className="text-[#D92D20] font-mono">12 Units</strong></span>
            <span className="text-[#667085] flex items-center gap-1 font-mono text-[11px]">
              <Clock className="w-3 h-3" /> Valid as of 10:42 · Recalculates in 4 min
            </span>
          </div>
        </div>

        <InventoryPosition sellable={4} onHand={5} reserved={1} inTransit={0} sapRecorded={5} />
      </div>

      {/* Decision Intelligence Recommendation & Candidate Trade-off Matrix */}
      <DecisionReasoningCard
        recommendation={recommendation}
        onAccept={handleApprove}
        onModify={() => setFeedbackModalMode('MODIFY')}
        onReject={() => setFeedbackModalMode('REJECT')}
      />

      {/* Cross-Store Network Availability Matrix */}
      <NetworkPositionMatrix sku="AP-PRO-USB-C" productName="AirPods Pro (USB-C MagSafe)" />

      {/* Comparison Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#101828]">Fulfillment Strategy Comparison</h2>
            <p className="text-xs text-[#667085]">
              SmartStock evaluates internal store balancing vs DC replenishment vs vendor PO.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {options.map((opt) => (
            <RecommendationCard
              key={opt.id}
              option={opt}
              isSelected={opt.id === selectedOptionId}
              onSelect={(o) => setSelectedOptionId(o.id)}
            />
          ))}
        </div>
      </div>

      {/* Recommendation Provenance */}
      <div className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-2 text-xs">
        <h4 className="font-semibold text-[#101828]">Recommendation Provenance & Inputs</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[#475467] font-mono text-[11px]">
          <div>• 7-Day Demand Forecast: <strong>6.2 units/day</strong></div>
          <div>• Store Transfer Lead: <strong>1h 20m</strong></div>
          <div>• Source Safety Buffer: <strong>3.8 DOS remaining</strong></div>
          <div>• Revenue Protected: <strong>€1,120</strong></div>
        </div>
      </div>

      {/* Bottom Approval Action Bar */}
      <div className="op-card p-5 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 border-t-2 border-[#14706B]">
        <div className="space-y-0.5 text-center sm:text-left">
          <p className="text-xs font-semibold text-[#101828]">
            Selected Strategy: <span className="text-[#14706B]">{selected.sourceName}</span>
          </p>
          <p className="text-[11px] text-[#667085]">
            Estimated arrival: <strong>{selected.estimatedArrival}</strong> · Qty: <strong>{selected.quantity} Units</strong>
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleSimulateOutcomeUnknown}
            className="text-[10px] text-[#98A2B3] hover:text-[#475467] underline pr-2"
          >
            [Test OUTCOME_UNKNOWN Recovery]
          </button>
          <Button
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            onClick={handleApprove}
            leftIcon={<Truck className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            Approve {selected.isRecommended ? 'Recommended Option' : 'Selected Strategy'}
          </Button>
        </div>
      </div>

      {/* Tier 3 Impact Modal if Vendor PO */}
      {impactModalData && (
        <ActionImpactModal
          isOpen={Boolean(impactModalData)}
          onClose={() => setImpactModalData(null)}
          impactData={impactModalData}
          onConfirm={async () => {
            UXTelemetry.track('impact_modal_confirmed', { sku: impactModalData.sku });
            toast({
              type: 'success',
              title: 'Purchase Order Submitted to Apple Inc.',
              description: `EDI 850 PO created for 96 units of ${impactModalData.sku}.`,
            });
          }}
        />
      )}
      {/* Decision Feedback Modal (Quantity Modification & Rejection Reasons) */}
      <DecisionFeedbackModal
        isOpen={Boolean(feedbackModalMode)}
        onClose={() => setFeedbackModalMode(null)}
        mode={feedbackModalMode || 'MODIFY'}
        recommendedQty={recommendation.selectedCandidate.quantity}
        onSubmit={({ modifiedQty, reasonCode, notes }) => {
          if (feedbackModalMode === 'MODIFY') {
            toast({
              type: 'success',
              title: 'Modified Transfer Approved',
              description: `Approved ${modifiedQty} units (adjusted from recommended ${recommendation.selectedCandidate.quantity}). Feedback recorded.`,
            });
          } else {
            toast({
              type: 'info',
              title: 'Recommendation Rejected',
              description: `Rejection reason (${reasonCode}) recorded in Decision Intelligence training outbox.`,
            });
          }
        }}
      />
    </div>
  );
}
