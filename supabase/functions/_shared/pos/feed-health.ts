// /supabase/functions/_shared/pos/feed-health.ts
// SmartStock LiveRetail V2 — Multi-Dimensional POS Feed Health & Confidence Engine (V1.1)

export interface FeedHealthInputs {
  last_event_at: string;
  expected_event_frequency_minutes?: number;
  maximum_silence_minutes?: number;
  activation_mode?: 'LIVE' | 'SHADOW' | 'DISABLED';
  sequence_gap_count?: number;
  reconciliation_mismatch_rate?: number; // 0 to 1
  rejected_event_rate?: number; // 0 to 1
  clock_quality_score?: number; // 0 to 100
  identity_unresolved_count?: number;
}

export interface FeedConfidenceBreakdown {
  overall: number;
  health_status: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'FAILED';
  dimensions: {
    recency: number;
    expected_frequency_adherence: number;
    sequence_completeness: number;
    reconciliation_quality: number;
    identity_coverage: number;
    clock_quality: number;
  };
}

export class POSFeedHealthEngine {
  /**
   * Evaluates multi-dimensional feed confidence considering expected delivery schedules.
   */
  static computeMultiDimensionalConfidence(inputs: FeedHealthInputs): FeedConfidenceBreakdown {
    const now = Date.now();
    const eventTime = inputs.last_event_at ? new Date(inputs.last_event_at).getTime() : 0;
    const minutesSince = eventTime > 0 ? Math.max(0, (now - eventTime) / 60000) : 999;

    const maxSilence = inputs.maximum_silence_minutes || 15;
    const expectedFreq = inputs.expected_event_frequency_minutes || 5;

    // 1. Recency adherence against expected schedule
    let recencyScore = 100;
    if (minutesSince > maxSilence) {
      const overageRatio = (minutesSince - maxSilence) / maxSilence;
      recencyScore = Math.max(0, Math.round(100 - overageRatio * 50));
    }

    // 2. Frequency adherence
    let freqScore = 100;
    if (minutesSince > expectedFreq * 2) {
      freqScore = Math.max(20, Math.round(100 - ((minutesSince - expectedFreq) / expectedFreq) * 20));
    }

    // 3. Sequence completeness
    const seqGaps = inputs.sequence_gap_count || 0;
    const seqScore = Math.max(0, 100 - seqGaps * 15);

    // 4. Reconciliation quality
    const reconMismatchRate = inputs.reconciliation_mismatch_rate || 0;
    const reconScore = Math.max(0, Math.round((1 - reconMismatchRate) * 100));

    // 5. Identity coverage
    const unresolved = inputs.identity_unresolved_count || 0;
    const identityScore = Math.max(0, 100 - unresolved * 5);

    // 6. Clock quality
    const clockScore = inputs.clock_quality_score ?? 100;

    // Weighted overall calculation
    const overall = Math.round(
      recencyScore * 0.25 +
      freqScore * 0.15 +
      seqScore * 0.20 +
      reconScore * 0.20 +
      identityScore * 0.10 +
      clockScore * 0.10
    );

    let status: FeedConfidenceBreakdown['health_status'] = 'HEALTHY';
    if (overall < 50 || minutesSince > maxSilence * 3) {
      status = 'FAILED';
    } else if (overall < 75 || minutesSince > maxSilence) {
      status = 'STALE';
    } else if (overall < 90) {
      status = 'DEGRADED';
    }

    return {
      overall,
      health_status: status,
      dimensions: {
        recency: recencyScore,
        expected_frequency_adherence: freqScore,
        sequence_completeness: seqScore,
        reconciliation_quality: reconScore,
        identity_coverage: identityScore,
        clock_quality: clockScore,
      },
    };
  }
}
