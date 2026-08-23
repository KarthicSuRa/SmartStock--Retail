// /src/lib/decision/policy-engine.ts
// SmartStock Decision Intelligence V1 — Retail Policy Engine & Hard Constraints

export interface RetailPolicyConfig {
  policyVersion: string;
  sourceMinSafetyDos: number; // e.g. 5.0 days
  maxTransferDistanceKm: number;
  enforceSupplierMoq: boolean;
  storeManagerMaxApprovalEur: number;
  minDecisionConfidenceThreshold: number; // e.g. 65%
  isKillSwitchActive: boolean;
}

export class PolicyEngine {
  private static defaultPolicy: RetailPolicyConfig = {
    policyVersion: 'v1.0',
    sourceMinSafetyDos: 5.0,
    maxTransferDistanceKm: 150.0,
    enforceSupplierMoq: true,
    storeManagerMaxApprovalEur: 5000.0,
    minDecisionConfidenceThreshold: 65,
    isKillSwitchActive: false,
  };

  static validateCandidate(
    candidateType: string,
    quantity: number,
    totalValueEur: number,
    sourceSurplusDos: number,
    policy: RetailPolicyConfig = this.defaultPolicy
  ): { isEligible: boolean; rejectionReason?: string } {
    if (candidateType === 'STORE_TRANSFER_STO') {
      if (sourceSurplusDos < policy.sourceMinSafetyDos) {
        return {
          isEligible: false,
          rejectionReason: `Source store would fall below minimum safety stock (${policy.sourceMinSafetyDos} DOS floor)`,
        };
      }
    }

    if (candidateType === 'VENDOR_PO' && policy.enforceSupplierMoq) {
      if (quantity < 10) {
        return {
          isEligible: false,
          rejectionReason: 'Quantity is below supplier Minimum Order Quantity (MOQ = 10 units)',
        };
      }
    }

    return { isEligible: true };
  }

  static getRequiredApprovalRole(
    totalCostEur: number,
    policy: RetailPolicyConfig = this.defaultPolicy
  ): 'FLOOR_WORKER' | 'STORE_MANAGER' | 'REGIONAL_MANAGER' | 'VP_SUPPLY_CHAIN' {
    if (totalCostEur <= 500) return 'FLOOR_WORKER';
    if (totalCostEur <= policy.storeManagerMaxApprovalEur) return 'STORE_MANAGER';
    if (totalCostEur <= 25000) return 'REGIONAL_MANAGER';
    return 'VP_SUPPLY_CHAIN';
  }

  static isAbstainRequired(confidence: number, policy: RetailPolicyConfig = this.defaultPolicy): boolean {
    return confidence < policy.minDecisionConfidenceThreshold;
  }
}
