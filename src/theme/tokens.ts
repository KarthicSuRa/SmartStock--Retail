// /src/theme/tokens.ts

export const statusColors = {
  HEALTHY: { bg: '#dcfce7', text: '#166534', border: '#22c55e', icon: 'CheckCircle' },
  REPLENISHMENT_NEEDED: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b', icon: 'AlertTriangle' },
  CRITICAL_RISK: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444', icon: 'AlertOctagon' },
  STOCKOUT_IMMINENT: { bg: '#fee2e2', text: '#7f1d1d', border: '#dc2626', icon: 'Flame' },
  EXPIRY_RISK: { bg: '#f3e8ff', text: '#6b21a8', border: '#a855f7', icon: 'Clock' },
  PENDING_SYNC: { bg: '#e0f2fe', text: '#075985', border: '#0ea5e9', icon: 'CloudOff' },
  SYNCED: { bg: '#dcfce7', text: '#166534', border: '#22c55e', icon: 'CloudCheck' },
} as const;

export const actionColors = {
  primary: '#0f172a',      // Slate 900 — enterprise feel
  secondary: '#3b82f6',    // Blue 500
  danger: '#dc2626',       // Red 600
  success: '#16a34a',      // Green 600
  warning: '#d97706',      // Amber 600
  surface: '#f8fafc',      // Slate 50
  elevated: '#ffffff',
};
