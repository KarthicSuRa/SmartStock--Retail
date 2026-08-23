'use client';

// /src/components/domain/DecisionReasoningCard.tsx
// SmartStock Decision Intelligence V1 — Structured Decision Reasoning & Candidate Trade-off Matrix

import React, { useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DecisionRecommendation, DecisionCandidate } from '@/lib/decision/types';
import { ContextBadges } from './ContextBadges';
import { ContextFeatureSnapshot } from '@/lib/context/types';
import { ContextFeatureBuilder } from '@/lib/context/context-feature-builder';
import { Sparkles, ArrowRight, ShieldCheck, HelpCircle, Layers, CheckCircle2, XCircle, Globe2 } from 'lucide-react';

export interface DecisionReasoningCardProps {
  recommendation: DecisionRecommendation;
  contextSnapshot?: ContextFeatureSnapshot;
  onAccept?: () => void;
  onModify?: () => void;
  onReject?: () => void;
  className?: string;
}

export const DecisionReasoningCard: React.FC<DecisionReasoningCardProps> = ({
  recommendation,
  contextSnapshot,
  onAccept,
  onModify,
  onReject,
  className = '',
}) => {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const { selectedCandidate, alternativeCandidates, humanReadableReasons, decisionConfidence } =
    recommendation;

  const context = contextSnapshot || ContextFeatureBuilder.buildContextSnapshot('1001', 'AP-PRO-USB-C');

  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#EAECF0] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#E8F4F3] text-[#14706B] flex items-center justify-center font-bold text-xs">
              AI
            </span>
            <h3 className="text-sm font-semibold text-[#101828]">SmartStock Decision Recommendation</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#E8F4F3] text-[#14706B] font-bold">
              CONFIDENCE {decisionConfidence}%
            </span>
          </div>
          <p className="text-xs text-[#667085]">
            Optimized operational action evaluated across multi-source availability and cost constraints.
          </p>
        </div>

        <Badge status={recommendation.decisionState === 'RECOMMEND' ? 'completed' : 'pending'} size="md">
          {recommendation.decisionState === 'RECOMMEND' ? 'Action Recommended' : 'Verification Required'}
        </Badge>
      </div>

      {/* External Context Signals (Weather, Promotions, Holidays, Local Events) */}
      <div className="space-y-1.5 p-3 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0]">
        <span className="text-[10px] uppercase font-semibold text-[#667085] flex items-center gap-1 font-mono">
          <Globe2 className="w-3 h-3 text-[#14706B]" />
          External Context Signals (Geographically Mapped):
        </span>
        <ContextBadges context={context} />
      </div>

      {/* Selected Recommendation Highlight */}
      <div className="p-4 rounded-[6px] bg-[#E8F4F3]/60 border border-[#14706B]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] uppercase font-mono font-bold text-[#14706B] block">
            Optimal Action Selected
          </span>
          <div className="text-sm font-bold text-[#101828] mt-0.5">
            {selectedCandidate.candidateType === 'STORE_TRANSFER_STO'
              ? `Internal Store Transfer (STO) · ${selectedCandidate.quantity} Units`
              : selectedCandidate.candidateType}
          </div>
          <div className="text-xs text-[#475467] font-mono mt-1">
            Source: <strong>{selectedCandidate.sourceLocationName}</strong> · Lead Time: <strong>{selectedCandidate.estimatedLeadHours}h</strong> · Transport Cost: <strong>€{selectedCandidate.estimatedCostEur.toFixed(2)}</strong>
          </div>
        </div>

        {/* Action Safeguard Buttons */}
        <div className="flex items-center gap-2">
          {onReject && (
            <Button variant="outline" size="sm" onClick={onReject}>
              Reject
            </Button>
          )}
          {onModify && (
            <Button variant="secondary" size="sm" onClick={onModify}>
              Modify Qty
            </Button>
          )}
          {onAccept && (
            <Button variant="primary" size="sm" onClick={onAccept} rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              Approve Action
            </Button>
          )}
        </div>
      </div>

      {/* Structured Evidence & Rationale */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-[#101828] flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#14706B]" />
          <span>Why this recommendation? (Structured Operational Evidence)</span>
        </h4>
        <ul className="space-y-1.5 text-xs text-[#475467] bg-[#F9FAFB] p-3 rounded-[6px] border border-[#EAECF0]">
          {humanReadableReasons.map((reason, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-[#14706B] font-bold leading-none mt-0.5">•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Candidate Comparison Matrix Toggle */}
      <div className="pt-1">
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="text-xs font-semibold text-[#14706B] hover:underline flex items-center gap-1"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{showAlternatives ? 'Hide Candidate Comparison Matrix' : 'View Evaluated Candidates & Trade-offs (4 Options)'}</span>
        </button>

        {showAlternatives && (
          <div className="mt-3 overflow-x-auto border border-[#EAECF0] rounded-[6px]">
            <table className="w-full text-xs font-mono text-left">
              <thead className="bg-[#F2F4F7] text-[#475467] border-b border-[#EAECF0]">
                <tr>
                  <th className="p-2.5 font-semibold">Candidate Action</th>
                  <th className="p-2.5 font-semibold">Source</th>
                  <th className="p-2.5 font-semibold text-right">Qty</th>
                  <th className="p-2.5 font-semibold text-right">Lead Time</th>
                  <th className="p-2.5 font-semibold text-right">Cost</th>
                  <th className="p-2.5 font-semibold text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAECF0] bg-white">
                <tr className="bg-[#EDFDF5]">
                  <td className="p-2.5 font-bold text-[#027A48]">✓ {selectedCandidate.candidateType} (Selected)</td>
                  <td className="p-2.5">{selectedCandidate.sourceLocationName}</td>
                  <td className="p-2.5 text-right">{selectedCandidate.quantity}</td>
                  <td className="p-2.5 text-right">{selectedCandidate.estimatedLeadHours}h</td>
                  <td className="p-2.5 text-right">€{selectedCandidate.estimatedCostEur.toFixed(2)}</td>
                  <td className="p-2.5 text-right font-bold text-[#027A48]">{selectedCandidate.compositeRankScore}</td>
                </tr>
                {alternativeCandidates.map((alt) => (
                  <tr key={alt.candidateId} className="text-[#475467]">
                    <td className="p-2.5">{alt.candidateType}</td>
                    <td className="p-2.5">{alt.sourceLocationName || '—'}</td>
                    <td className="p-2.5 text-right">{alt.quantity}</td>
                    <td className="p-2.5 text-right">{alt.estimatedLeadHours}h</td>
                    <td className="p-2.5 text-right">€{alt.estimatedCostEur.toFixed(2)}</td>
                    <td className="p-2.5 text-right">{alt.compositeRankScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
