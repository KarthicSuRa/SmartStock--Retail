// /src/lib/case-priority-scorer.ts
// SmartStock LiveRetail V2 — Multi-Factor Case Priority Scorer (Stage 13)

export interface CasePriorityInput {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  financial_exposure: number;
  confidence?: number | null;
  due_at?: string | null;
  detected_at: string;
}

export function calculateCasePriority(c: CasePriorityInput): number {
  const severityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  // Exposure score normalized (0 - 10)
  const exposureScore = Math.min((c.financial_exposure || 0) / 100, 10);

  // Lower confidence increases priority (needs urgent verification)
  const confidenceScore = (100 - (c.confidence ?? 85)) / 10;

  // Urgency score based on due_at proximity
  let urgencyScore = 0;
  if (c.due_at) {
    const hoursRemaining = (new Date(c.due_at).getTime() - Date.now()) / (1000 * 3600);
    urgencyScore = Math.max(0, 10 - hoursRemaining);
  }

  return (
    severityWeight[c.severity] * 3 +
    exposureScore * 2 +
    confidenceScore +
    urgencyScore
  );
}
