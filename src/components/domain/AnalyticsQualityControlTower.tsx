'use client';

// /src/components/domain/AnalyticsQualityControlTower.tsx
// SmartStock Intelligence RC1 — Analytics Data Quality & Observability Control Tower
//
// Every value rendered here must be supplied by a real telemetry source. The
// component previously shipped fixed numbers ("2.1 min ago", "99.8%",
// "18 / 24h") which read as live observability while nothing was being measured.
// When no value is supplied the tile renders an explicit "not reported" state.

import React from 'react';
import { Badge } from '../ui/Badge';
import { Database } from 'lucide-react';

export interface AnalyticsQualityTelemetry {
  /** Age of the most recent successful export, e.g. "2.1 min ago". */
  exportFreshness?: string;
  /** Share of source rows successfully mapped to conformed dimensions, e.g. "99.8%". */
  dimensionMapping?: string;
  /** Late-arriving records reprocessed in the last 24 hours. */
  lateRecords?: string;
  /** Failing metric tests in the last run. */
  metricTestFailures?: string;
  /** Overall pipeline state, as reported by the observability source. */
  pipelineHealthy?: boolean;
}

const NOT_REPORTED = 'Not reported';

const Tile: React.FC<{
  label: string;
  value?: string;
  emphasis?: boolean;
}> = ({ label, value, emphasis = false }) => (
  <div className="p-3.5 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
    <span className="text-[10px] font-sans uppercase text-[#667085] block">{label}</span>
    <strong className={`text-sm ${emphasis && value ? 'text-[#039855]' : value ? 'text-[#101828]' : 'text-[#98A2B3]'}`}>
      {value ?? NOT_REPORTED}
    </strong>
  </div>
);

export const AnalyticsQualityControlTower: React.FC<
  { className?: string } & AnalyticsQualityTelemetry
> = ({
  className = '',
  exportFreshness,
  dimensionMapping,
  lateRecords,
  metricTestFailures,
  pipelineHealthy,
}) => {
  return (
    <div className={`op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#EAECF0] pb-3">
        <div className="flex items-center gap-2.5">
          <Database className="w-5 h-5 text-[#14706B]" />
          <div>
            <h3 className="text-sm font-semibold text-[#101828]">Analytical Data Quality & Observability</h3>
            <p className="text-xs text-[#667085]">
              Health monitoring of incremental export watermarks, SCD dimensions, and late fact processing.
            </p>
          </div>
        </div>

        <Badge
          status={pipelineHealthy === undefined ? 'neutral' : pipelineHealthy ? 'healthy' : 'critical' as const}
          size="sm"
        >
          {pipelineHealthy === undefined
            ? 'Analytics Pipeline: Not Reported'
            : pipelineHealthy
              ? 'Analytics Pipeline: Healthy'
              : 'Analytics Pipeline: Degraded'}
        </Badge>
      </div>

      {/* Quality Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs text-center">
        <Tile label="Export Freshness" value={exportFreshness} />
        <Tile label="Dimension Mapping" value={dimensionMapping} />
        <Tile label="Late Records Reprocessed" value={lateRecords} />
        <Tile label="Metric Test Failures" value={metricTestFailures} emphasis />
      </div>
    </div>
  );
};
