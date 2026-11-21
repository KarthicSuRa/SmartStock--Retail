'use client';

// /src/components/ui/Badge.tsx
// SmartStock Experience RC2 — Semantic Status Dictionary
// Depth: 9 status values behind a small interface.
// One adapter (single status) = hypothetical seam — this module provides the mapping.
// Callers should use the StatusVariant type; legacy string aliases are supported
// but preferred replacement values are noted below.

export type StatusVariant =
  | 'healthy'
  | 'degraded'
  | 'critical'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'needs_review'
  // Legacy aliases — mapped directly for backward compatibility.
  // Prefer the primary StatusVariant values in new code.
  | 'warning'
  | 'info'
  // 'neutral' is the default when no status is provided.
  | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: StatusVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  status = 'neutral',
  children,
  size = 'md',
  showIcon = true,
  className = '',
  ...props
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-1.5 py-0.5 gap-1 font-medium',
    md: 'text-xs px-2 py-0.5 gap-1.5 font-medium',
  };

  // Nine distinct statuses; each has its own bg/text/border/symbol.
  // No logic here — the map is exhaustive and idempotent.
  const statusMap: Record<
    StatusVariant,
    { bg: string; text: string; border: string; symbol: string }
  > = {
    healthy: { bg: 'bg-[#EDFDF5]', text: 'text-[#027A48]', border: 'border-[#A6F4C5]', symbol: '✓' },
    degraded: { bg: 'bg-[#FEF6EE]', text: 'text-[#B54708]', border: 'border-[#FEDF89]', symbol: '▲' },
    critical: { bg: 'bg-[#FEF3F2]', text: 'text-[#B42318]', border: 'border-[#FECDCA]', symbol: '●' },
    pending: { bg: 'bg-[#EFF8FF]', text: 'text-[#175CD3]', border: 'border-[#B2DDFF]', symbol: 'ℹ' },
    processing: { bg: 'bg-[#EFF8FF]', text: 'text-[#175CD3]', border: 'border-[#B2DDFF]', symbol: 'ℹ' },
    completed: { bg: 'bg-[#EDFDF5]', text: 'text-[#027A48]', border: 'border-[#A6F4C5]', symbol: '✓' },
    needs_review: { bg: 'bg-[#FEF6EE]', text: 'text-[#B54708]', border: 'border-[#FEDF89]', symbol: '▲' },
    warning: { bg: 'bg-[#FEF6EE]', text: 'text-[#B54708]', border: 'border-[#FEDF89]', symbol: '▲' },
    info: { bg: 'bg-[#EFF8FF]', text: 'text-[#175CD3]', border: 'border-[#B2DDFF]', symbol: 'ℹ' },
    neutral: { bg: 'bg-[#F2F4F7]', text: 'text-[#344054]', border: 'border-[#EAECF0]', symbol: '■' },
  };

  const config = statusMap[status] || statusMap.neutral;

  return (
    <span
      className={`inline-flex items-center rounded-[4px] border ${config.bg} ${config.text} ${config.border} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {showIcon && <span className="text-[9px] font-mono leading-none">{config.symbol}</span>}
      <span>{children}</span>
    </span>
  );
};

Badge.displayName = 'Badge';