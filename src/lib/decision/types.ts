// /src/lib/decision/types.ts
// SmartStock Decision Intelligence V1 — Core Domain Contracts

export type DecisionType =
  | 'STOCKOUT_PREVENTION'
  | 'COUNT_ASSIGNMENT'
  | 'REPLENISHMENT'
  | 'EXCEPTION_PRIORITY'
  | 'SHRINK_INVESTIGATION';

export type CandidateType =
  | 'DO_NOTHING'
  | 'BACKROOM_PULL'
  | 'STORE_TRANSFER_STO'
  | 'DC_REPLENISHMENT'
  | 'VENDOR_PO';

export type DecisionState =
  | 'RECOMMEND'
  | 'VERIFY_FIRST'
  | 'HUMAN_REVIEW'
  | 'NO_ACTION';

export type RejectionReasonCode =
  | 'SOURCE_STORE_NEEDS_STOCK'
  | 'QUANTITY_TOO_HIGH'
  | 'TRANSPORT_UNAVAILABLE'
  | 'VENDOR_PREFERRED'
  | 'INFORMATION_INACCURATE'
  | 'OTHER';

export interface DecisionRequest {
  decisionId: string;
  tenantId: string;
  decisionType: DecisionType;
  locationId: string;
  productId: string;
  sku: string;
  inventoryPositionVersion: number;
  policyVersion: string;
  correlationId?: string;
  requestedAt: string;
}

export interface DecisionCandidate {
  candidateId: string;
  candidateType: CandidateType;
  sourceLocationId?: string;
  sourceLocationName?: string;
  quantity: number;
  estimatedCostEur: number;
  estimatedLeadHours: number;
  availabilityRiskScore: number; // 0-100
  sourceRiskScore: number; // 0-100
  compositeRankScore: number; // 0-100 (Higher is better)
  isEligibleByPolicy: boolean;
  policyRejectionReason?: string;
}

export interface ProbabilisticDemandForecast {
  p10DemandQty: number;
  p50DemandQty: number;
  p90DemandQty: number;
  forecastHorizonHours: number;
  selectedModel: 'PROPHET' | 'SEASONAL_NAIVE' | 'EXPONENTIAL_SMOOTHING';
  wapeError: number;
}

export interface StockoutRiskAssessment {
  stockoutProbability2h: number;
  stockoutProbability4h: number;
  stockoutProbability24h: number;
  projectedHoursToStockout: number;
  isHighRisk: boolean;
}

export interface DecisionRecommendation {
  recommendationId: string;
  decisionId: string;
  decisionState: DecisionState;
  decisionConfidence: number; // 0-100
  selectedCandidate: DecisionCandidate;
  alternativeCandidates: DecisionCandidate[];
  structuredReasonCodes: string[];
  humanReadableReasons: string[];
  modelVersions: Record<string, string>;
  policyVersion: string;
  approvalRequired: boolean;
  approvalRoleRequired: 'FLOOR_WORKER' | 'STORE_MANAGER' | 'REGIONAL_MANAGER' | 'VP_SUPPLY_CHAIN';
  abstainExplanation?: string;
  generatedAt: string;
}

export interface DecisionOutcomeRecord {
  outcomeId: string;
  decisionId: string;
  recommendationId: string;
  humanDecision: 'ACCEPTED_UNMODIFIED' | 'ACCEPTED_MODIFIED' | 'REJECTED' | 'ABSTAINED';
  modifiedQuantity?: number;
  rejectionReasonCode?: RejectionReasonCode;
  rejectionNotes?: string;
  decidedByUserId: string;
  decidedAt: string;
}
