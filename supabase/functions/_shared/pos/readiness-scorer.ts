// /supabase/functions/_shared/pos/readiness-scorer.ts
// SmartStock LiveRetail V2 — POS Connection Readiness & Activation Gate Engine

export interface POSReadinessScore {
  overall_score: number;
  dimensions: {
    auth_verified: boolean;
    product_mapping_rate: number; // e.g. 99.6%
    shadow_transactions: number; // e.g. 1,420
    shadow_mapping_success: number; // e.g. 99.8%
    certification_pass_rate: number; // e.g. 100%
  };
  activation_gate: 'READY_FOR_SHADOW' | 'SHADOW_IN_PROGRESS' | 'READY_TO_ACTIVATE' | 'BLOCKED';
  blocking_reasons: string[];
}

export class POSReadinessScorer {
  static evaluate(config: {
    hasAuth: boolean;
    productMappingRate: number;
    shadowTransactions: number;
    shadowSuccessRate: number;
    certPassRate: number;
    currentMode: 'LIVE' | 'SHADOW' | 'DISABLED';
  }): POSReadinessScore {
    const blockingReasons: string[] = [];

    if (!config.hasAuth) {
      blockingReasons.push('Authentication / API key not verified');
    }

    if (config.productMappingRate < 95.0) {
      blockingReasons.push(`Product identity mapping coverage too low (${config.productMappingRate.toFixed(1)}% < 95%)`);
    }

    if (config.certPassRate < 90.0) {
      blockingReasons.push(`Connector certification pass rate below threshold (${config.certPassRate.toFixed(1)}% < 90%)`);
    }

    let gate: POSReadinessScore['activation_gate'] = 'BLOCKED';

    if (blockingReasons.length === 0) {
      if (config.shadowTransactions >= 500 && config.shadowSuccessRate >= 99.0) {
        gate = 'READY_TO_ACTIVATE';
      } else if (config.currentMode === 'SHADOW') {
        gate = 'SHADOW_IN_PROGRESS';
      } else {
        gate = 'READY_FOR_SHADOW';
      }
    }

    // Weighted overall score
    const score =
      (config.hasAuth ? 20 : 0) +
      (config.productMappingRate * 0.3) +
      (Math.min(100, (config.shadowTransactions / 500) * 100) * 0.2) +
      (config.certPassRate * 0.3);

    return {
      overall_score: Math.min(100, Math.round(score)),
      dimensions: {
        auth_verified: config.hasAuth,
        product_mapping_rate: config.productMappingRate,
        shadow_transactions: config.shadowTransactions,
        shadow_mapping_success: config.shadowSuccessRate,
        certification_pass_rate: config.certPassRate,
      },
      activation_gate: gate,
      blocking_reasons: blockingReasons,
    };
  }
}
