'use client';

// /src/app/(desktop)/insights/page.tsx
// SmartStock Intelligence RC1 — Role-Based Business Intelligence & Observability Console

import React, { useState } from 'react';
import { useStoreContext } from '@/hooks/useStoreContext';
import { PilotScorecard } from '@/components/domain/PilotScorecard';
import { TruthGapWidget } from '@/components/domain/TruthGapWidget';
import { UncertaintyValueWidget } from '@/components/domain/UncertaintyValueWidget';
import { NetworkImbalanceWidget } from '@/components/domain/NetworkImbalanceWidget';
import { InsightCard } from '@/components/domain/InsightCard';
import { AnalyticsQualityControlTower } from '@/components/domain/AnalyticsQualityControlTower';
import { MetricExplanationDrawer, MetricExplanationData } from '@/components/domain/MetricExplanationDrawer';
import { InsightEngine } from '@/lib/analytics/insight-engine';
import { AnalyticsService } from '@/lib/analytics/analytics-service';
import { METRIC_CATALOG } from '@/lib/analytics/metric-catalog';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BarChart3, TrendingUp, TrendingDown, ArrowRight, ShieldCheck, RefreshCw, Calendar, Sparkles, Layers, Activity } from 'lucide-react';

interface StoreBenchmarkRow {
  storeId: string;
  storeName: string;
  accuracyPct: number;
  stockoutHoursPer1kTx: number;
  confidencePct: number;
  openCasesCount: number;
  unexplainedVarianceEur: number;
}

export default function InsightsPage() {
  const { role, activeStoreId } = useStoreContext();
  const [activeTab, setActiveTab] = useState<'EXECUTIVE' | 'STORE' | 'REGIONAL' | 'SUPPLY_CHAIN' | 'QUALITY'>(
    role === 'store_manager'
      ? 'STORE'
      : role === 'supply_chain'
      ? 'SUPPLY_CHAIN'
      : role === 'regional_manager'
      ? 'REGIONAL'
      : 'EXECUTIVE'
  );

  const [selectedMetricForExplanation, setSelectedMetricForExplanation] = useState<MetricExplanationData | null>(null);

  const pilotData = AnalyticsService.getPilotScorecard();
  const truthGapData = AnalyticsService.getTruthGap();
  const uncertaintyValueData = AnalyticsService.getUncertaintyValue();
  const cohortComparisons = AnalyticsService.getCohortComparisons();
  const rootCauses = [
    { cause: 'Unrecorded Damaged Stock', percentage: 34, occurrences: 42 },
    { cause: 'Physical Counting Error', percentage: 21, occurrences: 26 },
    { cause: 'POS Register Scan Timing Gap', percentage: 18, occurrences: 22 },
    { cause: 'Unexplained Variance', percentage: 14, occurrences: 17 },
    { cause: 'In-Transit Transfer Timing', percentage: 13, occurrences: 16 },
  ];
  const insights = InsightEngine.getActiveInsights(role, activeStoreId || '1001');

  const handleExplainMetric = (metricId: string) => {
    const metric = METRIC_CATALOG[metricId];
    if (!metric) return;

    setSelectedMetricForExplanation({
      metric,
      currentValue:
        metricId === 'INVENTORY_TRUTH_GAP'
          ? `€${truthGapData.unexplainedPhysicalGapEur.toLocaleString()}`
          : metricId === 'INVENTORY_ACCURACY_SYMMETRIC'
          ? `${pilotData.inventoryAccuracy.current}%`
          : metricId === 'STOCKOUT_HOURS_INTRADAY'
          ? `${pilotData.stockoutHours.current}h`
          : '€8.40M',
      comparisonDelta:
        metricId === 'INVENTORY_TRUTH_GAP'
          ? `${truthGapData.unexplainedChangePct}% vs baseline`
          : metricId === 'INVENTORY_ACCURACY_SYMMETRIC'
          ? `+${pilotData.inventoryAccuracy.change}pp vs baseline`
          : undefined,
      sourceFactTable: metric.sourceFact,
      freshnessTimestamp: '2.1 minutes ago',
      topContributors: [
        { name: 'Amsterdam Central (Store 1001)', contribution: '34% of variance' },
        { name: 'Rotterdam Centraal (Store 1003)', contribution: '28% of variance' },
        { name: 'Utrecht Station (Store 1004)', contribution: '19% of variance' },
      ],
    });
  };

  const benchmarkRows: StoreBenchmarkRow[] = [
    {
      storeId: '1001',
      storeName: 'Amsterdam Central',
      accuracyPct: 98.2,
      stockoutHoursPer1kTx: 12.4,
      confidencePct: 94,
      openCasesCount: 12,
      unexplainedVarianceEur: 1840,
    },
    {
      storeId: '1002',
      storeName: 'Amsterdam Zuid',
      accuracyPct: 96.9,
      stockoutHoursPer1kTx: 16.1,
      confidencePct: 89,
      openCasesCount: 18,
      unexplainedVarianceEur: 3120,
    },
    {
      storeId: '1003',
      storeName: 'Rotterdam Centraal',
      accuracyPct: 94.1,
      stockoutHoursPer1kTx: 28.7,
      confidencePct: 81,
      openCasesCount: 37,
      unexplainedVarianceEur: 8490,
    },
    {
      storeId: '1004',
      storeName: 'Utrecht Station',
      accuracyPct: 95.8,
      stockoutHoursPer1kTx: 19.3,
      confidencePct: 86,
      openCasesCount: 22,
      unexplainedVarianceEur: 4210,
    },
  ];

  const benchmarkColumns: Column<StoreBenchmarkRow>[] = [
    {
      key: 'storeName',
      header: 'Store',
      render: (r) => (
        <span className="font-semibold text-xs text-[#101828]">
          {r.storeName} <span className="font-mono text-[11px] text-[#667085]">({r.storeId})</span>
        </span>
      ),
      sortable: true,
    },
    {
      key: 'accuracyPct',
      header: 'Symmetric Accuracy',
      align: 'right',
      render: (r) => (
        <span className="font-mono font-bold text-xs text-[#101828]">{r.accuracyPct}%</span>
      ),
      sortable: true,
    },
    {
      key: 'stockoutHoursPer1kTx',
      header: 'Stockout / 1k Tx',
      align: 'right',
      render: (r) => (
        <span className={`font-mono text-xs ${r.stockoutHoursPer1kTx > 20 ? 'text-[#D92D20] font-bold' : 'text-[#475467]'}`}>
          {r.stockoutHoursPer1kTx}h
        </span>
      ),
      sortable: true,
    },
    {
      key: 'confidencePct',
      header: 'Confidence Score',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs text-[#039855] font-semibold">{r.confidencePct}%</span>
      ),
      sortable: true,
    },
    {
      key: 'openCasesCount',
      header: 'Open Exceptions',
      align: 'right',
      render: (r) => <span className="font-mono text-xs text-[#101828]">{r.openCasesCount}</span>,
      sortable: true,
    },
    {
      key: 'unexplainedVarianceEur',
      header: 'Unexplained Gap',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-[#D92D20]">
          €{r.unexplainedVarianceEur.toLocaleString()}
        </span>
      ),
      sortable: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── TOP HEADER & WORKSPACE TABS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E4E7EC] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#101828] tracking-tight">Intelligence & Analytics</h1>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#E8F4F3] text-[#14706B] border border-[#14706B]/20">
              RC1 Hardened
            </span>
          </div>
          <p className="text-xs text-[#475467] mt-0.5">
            Decoupled analytical plane, like-for-like reconciliation truth, and data lineage governance.
          </p>
        </div>

        {/* Workspace Selector */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#F2F4F7] rounded-[6px] text-xs font-medium">
          <button
            onClick={() => setActiveTab('EXECUTIVE')}
            className={`px-3 py-1.5 rounded-[4px] transition-colors ${
              activeTab === 'EXECUTIVE' ? 'bg-white text-[#101828] font-semibold shadow-2xs' : 'text-[#667085] hover:text-[#101828]'
            }`}
          >
            Executive Pilot Scorecard
          </button>
          <button
            onClick={() => setActiveTab('STORE')}
            className={`px-3 py-1.5 rounded-[4px] transition-colors ${
              activeTab === 'STORE' ? 'bg-white text-[#101828] font-semibold shadow-2xs' : 'text-[#667085] hover:text-[#101828]'
            }`}
          >
            Store Root Cause
          </button>
          <button
            onClick={() => setActiveTab('REGIONAL')}
            className={`px-3 py-1.5 rounded-[4px] transition-colors ${
              activeTab === 'REGIONAL' ? 'bg-white text-[#101828] font-semibold shadow-2xs' : 'text-[#667085] hover:text-[#101828]'
            }`}
          >
            Regional Benchmark
          </button>
          <button
            onClick={() => setActiveTab('SUPPLY_CHAIN')}
            className={`px-3 py-1.5 rounded-[4px] transition-colors ${
              activeTab === 'SUPPLY_CHAIN' ? 'bg-white text-[#101828] font-semibold shadow-2xs' : 'text-[#667085] hover:text-[#101828]'
            }`}
          >
            Supply Chain & Network
          </button>
          <button
            onClick={() => setActiveTab('QUALITY')}
            className={`px-3 py-1.5 rounded-[4px] transition-colors ${
              activeTab === 'QUALITY' ? 'bg-white text-[#101828] font-semibold shadow-2xs' : 'text-[#667085] hover:text-[#101828]'
            }`}
          >
            Data Quality
          </button>
        </div>
      </div>

      {/* ── TAB 1: EXECUTIVE & PILOT SCORECARD ── */}
      {activeTab === 'EXECUTIVE' && (
        <div className="space-y-6">
          <PilotScorecard data={pilotData} onExplainMetric={handleExplainMetric} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TruthGapWidget
              data={truthGapData}
              onExplain={() => handleExplainMetric('INVENTORY_TRUTH_GAP')}
            />
            <UncertaintyValueWidget
              data={uncertaintyValueData}
              onExplain={() => handleExplainMetric('VALUE_AT_RISK_UNCERTAINTY')}
            />
          </div>

          {/* Cohort Comparison: Pilot vs Control */}
          <div className="op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAECF0] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-[#101828]">Cohort Performance Comparison</h3>
                <p className="text-xs text-[#667085]">
                  Statistically normalized performance: 4 Pilot Stores vs 12 Control Stores.
                </p>
              </div>
              <Badge status="healthy" size="sm">
                Cohort Confidence: 95%
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              {cohortComparisons.map((c, i) => (
                <div key={i} className="p-4 rounded-[6px] bg-[#F9FAFB] border border-[#EAECF0] space-y-2">
                  <span className="text-[11px] font-sans font-semibold text-[#101828] block">
                    {c.metricName}
                  </span>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#667085] font-sans">Pilot Cohort:</span>
                    <strong className="text-[#039855]">{c.pilotStoresValue}</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#667085] font-sans">Control Cohort:</span>
                    <span className="text-[#475467]">{c.controlStoresValue}</span>
                  </div>
                  <div className="pt-1 border-t border-[#EAECF0] flex justify-between font-sans text-xs">
                    <span className="text-[#667085]">Net Improvement:</span>
                    <strong className="text-[#039855] font-mono">{c.netDelta}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: STORE MANAGER ("What keeps going wrong?") ── */}
      {activeTab === 'STORE' && (
        <div className="space-y-6">
          <div className="op-card p-6 bg-white border border-[#E4E7EC] rounded-[8px] space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#101828]">
                Discrepancy Root Causes — Store {activeStoreId || '1001'} (Last 30 Days)
              </h3>
              <p className="text-xs text-[#667085]">
                Aggregated primary causes behind verified physical inventory variances.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {rootCauses.map((rc, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#101828]">{rc.cause}</span>
                    <span className="font-mono text-[#667085]">
                      {rc.occurrences} cases ({rc.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#EAECF0] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#14706B] h-full rounded-full"
                      style={{ width: `${rc.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: REGIONAL BENCHMARK ── */}
      {activeTab === 'REGIONAL' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#101828]">Netherlands West Store Benchmarking</h3>
            <p className="text-xs text-[#667085]">
              Cross-store accuracy, stockout hours per 1,000 transaction lines, and unexplained variance.
            </p>
          </div>
          <DataTable
            columns={benchmarkColumns}
            data={benchmarkRows}
            keyExtractor={(r) => r.storeId}
            density="comfortable"
          />
        </div>
      )}

      {/* ── TAB 4: SUPPLY CHAIN & NETWORK ── */}
      {activeTab === 'SUPPLY_CHAIN' && (
        <div className="space-y-6">
          <NetworkImbalanceWidget />

          <div className="op-card p-5 bg-white border border-[#E4E7EC] rounded-[8px] space-y-3">
            <h4 className="text-xs font-semibold uppercase text-[#667085]">
              Demand Forecast Performance (Prophet Model Evaluation)
            </h4>
            <div className="grid grid-cols-3 gap-3 font-mono text-center text-xs">
              <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
                <span className="text-[10px] font-sans text-[#667085] block">Weighted WAPE</span>
                <strong className="text-base font-bold text-[#101828]">14.2%</strong>
              </div>
              <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
                <span className="text-[10px] font-sans text-[#667085] block">Forecast Bias</span>
                <strong className="text-base font-bold text-[#039855]">-2.1%</strong>
              </div>
              <div className="p-3 bg-[#F9FAFB] rounded-[6px] border border-[#EAECF0]">
                <span className="text-[10px] font-sans text-[#667085] block">Optimal Model Share</span>
                <strong className="text-base font-bold text-[#14706B]">Prophet 52%</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: DATA QUALITY & OBSERVABILITY ── */}
      {activeTab === 'QUALITY' && (
        <div className="space-y-6">
          <AnalyticsQualityControlTower />
        </div>
      )}

      {/* ── ACTIONABLE & DEDUPLICATED INSIGHTS FEED (Across all tabs) ── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#14706B]" />
          <h2 className="text-sm font-semibold text-[#101828]">Actionable Business Insights</h2>
          <span className="text-xs font-mono text-[#667085]">({insights.length} Active Deduplicated)</span>
        </div>

        <div className="space-y-3">
          {insights.map((ins) => (
            <InsightCard key={ins.id} insight={ins} />
          ))}
        </div>
      </div>

      {/* ── "EXPLAIN THIS NUMBER" LINEAGE DRAWER ── */}
      <MetricExplanationDrawer
        isOpen={Boolean(selectedMetricForExplanation)}
        onClose={() => setSelectedMetricForExplanation(null)}
        explanationData={selectedMetricForExplanation}
      />
    </div>
  );
}
