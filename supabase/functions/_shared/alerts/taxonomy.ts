// /supabase/functions/_shared/alerts/taxonomy.ts
// SmartStock LiveRetail V2 — Operational Alert Taxonomy & Severity Matrix (RC1)

export type OperationalAlertCode =
  | 'POS_FEED_SILENT'
  | 'PROJECTION_BACKLOG'
  | 'ORPHANED_EVENT'
  | 'RECONCILIATION_DEGRADED'
  | 'SAP_AUTH_FAILED'
  | 'SAP_POST_BACKLOG'
  | 'OUTCOME_UNKNOWN_STALE'
  | 'DEAD_LETTER_PRESENT'
  | 'CLOCK_ANOMALY'
  | 'CONFIDENCE_NETWORK_DEGRADED';

export interface AlertDefinition {
  code: OperationalAlertCode;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  runbookUrl: string;
  autoEscalateMinutes: number;
}

export const ALERT_TAXONOMY: Record<OperationalAlertCode, AlertDefinition> = {
  POS_FEED_SILENT: { code: 'POS_FEED_SILENT', severity: 'HIGH', runbookUrl: 'docs/runbooks/POS_FEED_SILENT.md', autoEscalateMinutes: 30 },
  PROJECTION_BACKLOG: { code: 'PROJECTION_BACKLOG', severity: 'HIGH', runbookUrl: 'docs/runbooks/PROJECTION_BACKLOG.md', autoEscalateMinutes: 15 },
  ORPHANED_EVENT: { code: 'ORPHANED_EVENT', severity: 'MEDIUM', runbookUrl: 'docs/runbooks/ORPHANED_EVENT.md', autoEscalateMinutes: 60 },
  RECONCILIATION_DEGRADED: { code: 'RECONCILIATION_DEGRADED', severity: 'CRITICAL', runbookUrl: 'docs/runbooks/RECONCILIATION_DEGRADED.md', autoEscalateMinutes: 120 },
  SAP_AUTH_FAILED: { code: 'SAP_AUTH_FAILED', severity: 'CRITICAL', runbookUrl: 'docs/runbooks/SAP_AUTH_FAILED.md', autoEscalateMinutes: 10 },
  SAP_POST_BACKLOG: { code: 'SAP_POST_BACKLOG', severity: 'HIGH', runbookUrl: 'docs/runbooks/SAP_POST_BACKLOG.md', autoEscalateMinutes: 30 },
  OUTCOME_UNKNOWN_STALE: { code: 'OUTCOME_UNKNOWN_STALE', severity: 'HIGH', runbookUrl: 'docs/runbooks/OUTCOME_UNKNOWN_STALE.md', autoEscalateMinutes: 60 },
  DEAD_LETTER_PRESENT: { code: 'DEAD_LETTER_PRESENT', severity: 'MEDIUM', runbookUrl: 'docs/runbooks/DEAD_LETTER_PRESENT.md', autoEscalateMinutes: 120 },
  CLOCK_ANOMALY: { code: 'CLOCK_ANOMALY', severity: 'LOW', runbookUrl: 'docs/runbooks/CLOCK_ANOMALY.md', autoEscalateMinutes: 240 },
  CONFIDENCE_NETWORK_DEGRADED: { code: 'CONFIDENCE_NETWORK_DEGRADED', severity: 'HIGH', runbookUrl: 'docs/runbooks/CONFIDENCE_NETWORK_DEGRADED.md', autoEscalateMinutes: 120 },
};
