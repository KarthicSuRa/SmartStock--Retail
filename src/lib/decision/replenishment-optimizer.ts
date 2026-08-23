// /src/lib/decision/replenishment-optimizer.ts
// SmartStock Decision Intelligence V1 — Operations Research Replenishment Solver

import { SKUFeatureSnapshot } from './feature-service';
import { DecisionCandidate, CandidateType } from './types';
import { PolicyEngine } from './policy-engine';

export class ReplenishmentOptimizer {
  static generateCandidates(features: SKUFeatureSnapshot): DecisionCandidate[] {
    const requiredQty = 12;

    const rawCandidates: {
      type: CandidateType;
      sourceId?: string;
      sourceName?: string;
      qty: number;
      cost: number;
      leadHours: number;
      availRisk: number;
      sourceRisk: number;
      sourceSurplusDos: number;
    }[] = [
      {
        type: 'STORE_TRANSFER_STO',
        sourceId: '1002',
        sourceName: 'Amsterdam Zuid',
        qty: requiredQty,
        cost: 14.5,
        leadHours: 1.3,
        availRisk: 12,
        sourceRisk: 8,
        sourceSurplusDos: 8.4,
      },
      {
        type: 'DC_REPLENISHMENT',
        sourceId: 'DC-MOERDIJK',
        sourceName: 'Moerdijk Central DC',
        qty: requiredQty * 2,
        cost: 22.0,
        leadHours: 18.0,
        availRisk: 35,
        sourceRisk: 5,
        sourceSurplusDos: 45.0,
      },
      {
        type: 'VENDOR_PO',
        sourceId: 'VEND-APPLE-EU',
        sourceName: 'Apple Distribution Direct',
        qty: 48,
        cost: 96.0,
        leadHours: 72.0,
        availRisk: 82,
        sourceRisk: 15,
        sourceSurplusDos: 999.0,
      },
      {
        type: 'DO_NOTHING',
        qty: 0,
        cost: 0.0,
        leadHours: 0.0,
        availRisk: 95,
        sourceRisk: 0,
        sourceSurplusDos: 0.0,
      },
    ];

    return rawCandidates.map((c, idx) => {
      const policyValidation = PolicyEngine.validateCandidate(
        c.type,
        c.qty,
        c.cost,
        c.sourceSurplusDos
      );

      // Objective scoring function: Minimize (Availability Risk + Transport Cost Penalty + Lead Time Penalty)
      const leadPenalty = c.leadHours * 0.5;
      const costPenalty = c.cost * 0.2;
      const totalPenalty = c.availRisk * 0.6 + leadPenalty + costPenalty;
      const rankScore = Math.max(Number((100 - totalPenalty).toFixed(1)), 10);

      return {
        candidateId: `cand-${idx + 1}`,
        candidateType: c.type,
        sourceLocationId: c.sourceId,
        sourceLocationName: c.sourceName,
        quantity: c.qty,
        estimatedCostEur: c.cost,
        estimatedLeadHours: c.leadHours,
        availabilityRiskScore: c.availRisk,
        sourceRiskScore: c.sourceRisk,
        compositeRankScore: rankScore,
        isEligibleByPolicy: policyValidation.isEligible,
        policyRejectionReason: policyValidation.rejectionReason,
      };
    });
  }
}
