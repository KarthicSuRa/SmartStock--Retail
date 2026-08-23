'use client';

// src/app/page.tsx
// SmartStock LiveRetail — Enterprise Landing Page

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Camera,
  ArrowRight,
  TrendingUp,
  Cpu,
  BarChart3,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  Clock,
  Sparkles,
  ChevronRight,
  ExternalLink,
  Boxes,
  Eye,
  Lock,
  Workflow
} from 'lucide-react';

export default function LandingPage() {
  // ROI Simulator State
  const [storeCount, setStoreCount] = useState(15);
  const [avgRevenuePerStore, setAvgRevenuePerStore] = useState(3.5); // millions €

  // Calculated ROI values
  const totalGmv = storeCount * avgRevenuePerStore * 1000000;
  const stockoutSavings = Math.round(totalGmv * 0.024); // 2.4% recovered sales
  const shrinkReduction = Math.round(totalGmv * 0.008); // 0.8% shrink mitigation
  const laborHoursSaved = storeCount * 420; // hours/year

  // Active Interactive Preview Tab
  const [activeTab, setActiveTab] = useState<'radar' | 'pos' | 'fefo' | 'floor'>('radar');

  return (
    <div className="min-h-screen bg-[#0B0F19] text-white selection:bg-[#14706B] selection:text-white font-sans antialiased">
      
      {/* ── HEADER / NAVIGATION ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0B0F19]/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#14706B] via-[#0E5652] to-emerald-500 flex items-center justify-center font-black text-lg shadow-lg shadow-[#14706B]/20 border border-emerald-400/30">
              SS
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-lg text-white">SmartStock</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                  LiveRetail PRO
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">SAP S/4HANA OData Engine</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#solutions" className="hover:text-emerald-400 transition-colors">Modules</a>
            <a href="#architecture" className="hover:text-emerald-400 transition-colors">Architecture</a>
            <a href="#roi-calculator" className="hover:text-emerald-400 transition-colors">ROI Impact</a>
            <Link href="/ledger" className="hover:text-emerald-400 transition-colors">Event Ledger</Link>
            <Link href="/admin/pos-control-tower" className="hover:text-emerald-400 transition-colors">POS Tower</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs sm:text-sm font-medium text-slate-300 hover:text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-slate-800/60 transition-all"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard"
              className="text-xs sm:text-sm font-bold bg-gradient-to-r from-[#14706B] to-emerald-600 hover:from-[#0E5652] hover:to-emerald-500 text-white px-4 sm:px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-1.5 border border-emerald-400/20"
            >
              <span>Live Console</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative pt-16 pb-24 overflow-hidden">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-[#14706B]/20 via-emerald-600/15 to-blue-600/10 blur-[130px] -z-10 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          {/* Status Chip */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/70 text-xs text-slate-300 shadow-xl backdrop-blur-md">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-mono text-emerald-400 font-semibold">Sub-Second Synchronicity</span>
            <span className="text-slate-500">·</span>
            <span>SAP S/4HANA OData Certified Architecture</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.1]">
            Autonomous Retail Inventory Intelligence <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
              at Physical-Store Velocity.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto font-normal leading-relaxed">
            Eliminate ghost inventory, stockouts, and FEFO shrink. Connect POS continuous feeds, computer vision shelf health, and multi-echelon ERP ledgers into an immutable real-time digital twin.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-[#14706B] via-emerald-600 to-teal-600 hover:opacity-95 text-white font-bold rounded-2xl text-base shadow-2xl shadow-emerald-950/60 flex items-center gap-2.5 transition-all transform hover:-translate-y-0.5 border border-emerald-300/30"
            >
              <Activity className="w-5 h-5 text-emerald-200" />
              <span>Launch Intelligent Radar</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/floor"
              className="px-8 py-4 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold rounded-2xl text-base shadow-xl flex items-center gap-2.5 transition-all hover:text-white"
            >
              <Smartphone className="w-5 h-5 text-teal-400" />
              <span>Floor Staff Mobile PWA</span>
            </Link>
          </div>

          {/* Live System Metrics Strip */}
          <div className="pt-10 max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
                <span>BATCH EFFICIENCY</span>
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono">99.8%</div>
              <div className="text-xs text-slate-400 mt-1">Idempotent OData sync</div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
                <span>PROTECTED REVENUE</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">€38,200</div>
              <div className="text-xs text-slate-400 mt-1">+14.2% vs previous mo</div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
                <span>EVENT LATENCY</span>
                <Clock className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono">1.2s</div>
              <div className="text-xs text-slate-400 mt-1">Scan-to-fulfill velocity</div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
                <span>PROJECTIONS</span>
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">72 Active</div>
              <div className="text-xs text-slate-400 mt-1">Immutable ledger rules</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE WORKSPACE PREVIEW ── */}
      <section id="preview" className="py-16 bg-slate-950/60 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">Interactive Operations</span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mt-1">
                Engineered for Store Managers & Floor Operations
              </h2>
            </div>

            {/* Tab Selectors */}
            <div className="flex flex-wrap gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('radar')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'radar' ? 'bg-[#14706B] text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Intelligent Radar
              </button>
              <button
                onClick={() => setActiveTab('pos')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'pos' ? 'bg-[#14706B] text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                POS Control Tower
              </button>
              <button
                onClick={() => setActiveTab('fefo')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'fefo' ? 'bg-[#14706B] text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                FEFO Markdown Engine
              </button>
              <button
                onClick={() => setActiveTab('floor')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'floor' ? 'bg-[#14706B] text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Floor Staff PWA
              </button>
            </div>
          </div>

          {/* Interactive Mock Frame */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl overflow-hidden relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                <span className="ml-2 font-mono text-slate-500">live-retail-telemetry.corp.internal</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Connected: Store 1001 (Amsterdam Central)</span>
              </div>
            </div>

            {activeTab === 'radar' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                <div className="lg:col-span-2 space-y-4">
                  <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 font-mono text-xs font-bold border border-rose-500/30">
                          CRITICAL EXCEPTION
                        </span>
                        <span className="font-bold text-white text-sm">AirPods Pro (USB-C MagSafe)</span>
                      </div>
                      <span className="font-mono text-xs text-rose-400 font-semibold">Due in 2h 18m</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Stockout expected at sales velocity 0.8 units/hr. 4 units sellable remaining. Amsterdam Zuid has 36 units surplus buffer.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <span className="text-[11px] font-mono px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Protection: €1,120 Lost Sales
                      </span>
                      <span className="text-[11px] font-mono px-2 py-1 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                        Recommendation: STO Transfer (12 units)
                      </span>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-mono text-xs font-bold border border-amber-500/30">
                          PROMO UPLIFT
                        </span>
                        <span className="font-bold text-white text-sm">Coca Cola Zero 330ml Can (24pk)</span>
                      </div>
                      <span className="font-mono text-xs text-amber-400 font-semibold">Runout: 0.6 days</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      High velocity promotion active. Emergency stock transport scheduled from Moerdijk Distribution Center.
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-800 space-y-4">
                  <h4 className="font-bold text-sm text-white">Intelligent Radar Metrics</h4>
                  <div className="space-y-3 text-xs font-mono">
                    <div className="flex justify-between pb-2 border-b border-slate-800">
                      <span className="text-slate-400">Inventory Reconciled:</span>
                      <span className="text-emerald-400 font-bold">98.4%</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-slate-800">
                      <span className="text-slate-400">Confidence Score:</span>
                      <span className="text-emerald-400 font-bold">91%</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-slate-800">
                      <span className="text-slate-400">Active Stockout Risks:</span>
                      <span className="text-rose-400 font-bold">7 SKUs</span>
                    </div>
                  </div>
                  <Link
                    href="/dashboard"
                    className="w-full py-3 bg-[#14706B] hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all mt-4"
                  >
                    <span>Open Dashboard</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}

            {activeTab === 'pos' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-xs text-slate-400 font-mono">SHOPIFY & CLOVER FEED</div>
                    <div className="text-xl font-bold text-emerald-400 font-mono mt-1">Connected (0.4s lag)</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-xs text-slate-400 font-mono">SQUARE & LIGHTSPEED</div>
                    <div className="text-xl font-bold text-emerald-400 font-mono mt-1">Active Polling (1.2s)</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-xs text-slate-400 font-mono">DEAD LETTER QUARANTINE</div>
                    <div className="text-xl font-bold text-slate-200 font-mono mt-1">0 Unresolved</div>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                  <div className="text-emerald-400 font-bold mb-2">POS Ingestion Gateway Event Stream:</div>
                  <p className="text-slate-400">✓ [12:50:11] Webhook received: store_1001 · SKU: MAT-20349 · Qty: 2 · Status: Ingested</p>
                  <p className="text-slate-400">✓ [12:50:12] Ledger Projection: Decremented sellable stock · Position updated (42 → 40)</p>
                  <p className="text-slate-400">✓ [12:50:13] SAP Outbox: Queued for Idempotent OData BAPI transaction</p>
                </div>
                <Link
                  href="/admin/pos-control-tower"
                  className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300"
                >
                  <span>Launch POS Control Tower →</span>
                </Link>
              </div>
            )}

            {activeTab === 'fefo' && (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">FEFO Expiry Action: Organic Milk 1L (Batch #B9042)</span>
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-xs font-mono font-bold">Expires in 24 Hours</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Automated dynamic markdown recommendation (-30%) calculated to achieve 96% sell-through before expiration threshold.
                  </p>
                  <div className="flex gap-3 pt-2">
                    <Link
                      href="/fefo"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs"
                    >
                      Review FEFO Actions
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'floor' && (
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Mobile Floor Staff Assistant (PWA)</span>
                    <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 text-xs font-mono font-bold">Offline-First IDB Active</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Floor associates conduct guided cycle counts, scan shelf health with device cameras, and log damaged goods with instantaneous optimistic synchronization.
                  </p>
                  <div className="flex gap-3 pt-2">
                    <Link
                      href="/floor"
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-bold text-xs"
                    >
                      Open Floor Staff PWA
                    </Link>
                    <Link
                      href="/shelf-health"
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-xs"
                    >
                      Vision Shelf Scanner
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── CORE CAPABILITIES MATRIX ── */}
      <section id="solutions" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">Full Stack Architecture</span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Six Enterprise Modules. One Unified Digital Twin.
          </h2>
          <p className="text-slate-400 text-sm sm:text-base">
            From shelf-edge camera audits to multi-store supply chain replenishment, each module works seamlessly to keep your store operating at peak margin.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1 */}
          <Link href="/dashboard" className="group p-8 rounded-3xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900 transition-all duration-300 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">Intelligent Radar</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Autonomous stockout forecasting, demand uplift tracking, and proactive transfer recommendations before shelves go empty.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <span>Explore Radar</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          {/* Card 2 */}
          <Link href="/ledger" className="group p-8 rounded-3xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900 transition-all duration-300 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform">
                <Boxes className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-teal-400 transition-colors">Immutable Event Ledger</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Single-source-of-truth bi-temporal ledger tracking every unit across on-hand, reserved, in-transit, and sellable states.
              </p>
            </div>
            <span className="text-xs font-bold text-teal-400 flex items-center gap-1">
              <span>View Ledger</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          {/* Card 3 */}
          <Link href="/shelf-health" className="group p-8 rounded-3xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900 transition-all duration-300 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                <Eye className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-cyan-400 transition-colors">Vision Shelf Health</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Computer vision audits on standard mobile hardware to detect facing gaps, misplaced items, and shelf tag discrepancies.
              </p>
            </div>
            <span className="text-xs font-bold text-cyan-400 flex items-center gap-1">
              <span>Test Shelf Vision</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          {/* Card 4 */}
          <Link href="/fefo" className="group p-8 rounded-3xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900 transition-all duration-300 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">FEFO Expiry Actions</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Dynamic pricing and automated markdown workflows prioritizing oldest batch inventory to eliminate perishable waste.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
              <span>Review FEFO</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          {/* Card 5 */}
          <Link href="/admin/pos-control-tower" className="group p-8 rounded-3xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900 transition-all duration-300 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">Universal POS Gateway</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Continuous real-time ingestion across Square, Shopify, Clover, and Lightspeed with automated quarantine isolation.
              </p>
            </div>
            <span className="text-xs font-bold text-indigo-400 flex items-center gap-1">
              <span>View POS Gateway</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          {/* Card 6 */}
          <Link href="/counts" className="group p-8 rounded-3xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 hover:bg-slate-900 transition-all duration-300 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-rose-400 transition-colors">Smart Cycle Counts</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Targeted AI-prioritized count tasks focusing associate effort on discrepancy-prone SKUs rather than full store shutdowns.
              </p>
            </div>
            <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
              <span>See Cycle Counts</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
        </div>
      </section>

      {/* ── INTERACTIVE ROI CALCULATOR ── */}
      <section id="roi-calculator" className="py-20 bg-gradient-to-b from-[#0B0F19] to-slate-950 border-t border-slate-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-3 mb-12">
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">Value Simulator</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Estimate Your Store Network Savings
            </h2>
            <p className="text-slate-400 text-sm">
              Model your return on investment based on stockout prevention and shrink reduction.
            </p>
          </div>

          <div className="p-8 sm:p-10 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Slider 1 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-300">Number of Retail Stores:</span>
                  <span className="font-mono text-emerald-400 text-lg font-bold">{storeCount} Stores</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={storeCount}
                  onChange={(e) => setStoreCount(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#14706B]"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>1 Store</span>
                  <span>50 Stores</span>
                  <span>100 Stores</span>
                </div>
              </div>

              {/* Slider 2 */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-300">Avg Annual GMV per Store:</span>
                  <span className="font-mono text-emerald-400 text-lg font-bold">€{avgRevenuePerStore}M</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="20"
                  step="0.5"
                  value={avgRevenuePerStore}
                  onChange={(e) => setAvgRevenuePerStore(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#14706B]"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>€500k</span>
                  <span>€10M</span>
                  <span>€20M</span>
                </div>
              </div>
            </div>

            {/* Calculated Output Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 text-center">
                <div className="text-xs font-mono text-slate-400 mb-1">PROTECTED REVENUE / YR</div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  €{(stockoutSavings / 1000).toFixed(0)}k
                </div>
                <div className="text-[11px] text-slate-500 mt-1">From prevented stockouts</div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 text-center">
                <div className="text-xs font-mono text-slate-400 mb-1">SHRINK REDUCTION / YR</div>
                <div className="text-2xl sm:text-3xl font-black text-teal-400 font-mono">
                  €{(shrinkReduction / 1000).toFixed(0)}k
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Via FEFO dynamic pricing</div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 text-center">
                <div className="text-xs font-mono text-slate-400 mb-1">STAFF HOURS SAVED</div>
                <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">
                  {laborHoursSaved.toLocaleString()} hrs
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Autonomous cycle audits</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ENTERPRISE ARCHITECTURE CALLOUT ── */}
      <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#0E5652]/40 border border-slate-800 p-8 sm:p-12 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">Enterprise Ready</span>
            <h2 className="text-3xl font-black text-white tracking-tight">
              Ready to elevate your retail operations?
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Explore the live store manager console, floor associate scanning PWA, and SAP integration outbox directly in your browser.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-[#14706B] to-emerald-600 hover:from-[#0E5652] hover:to-emerald-500 text-white font-bold rounded-2xl text-center shadow-lg transition-all"
            >
              Open Manager Portal
            </Link>
            <Link
              href="/floor"
              className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl text-center border border-slate-700 transition-all"
            >
              Open Floor PWA
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-12 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <span className="font-bold text-white uppercase tracking-wider text-xs font-mono">Operations</span>
            <ul className="space-y-2">
              <li><Link href="/dashboard" className="hover:text-emerald-400 transition-colors">Intelligent Radar</Link></li>
              <li><Link href="/ledger" className="hover:text-emerald-400 transition-colors">Inventory Ledger</Link></li>
              <li><Link href="/counts" className="hover:text-emerald-400 transition-colors">Smart Cycle Counts</Link></li>
              <li><Link href="/fefo" className="hover:text-emerald-400 transition-colors">FEFO Expiry Actions</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <span className="font-bold text-white uppercase tracking-wider text-xs font-mono">Floor Staff</span>
            <ul className="space-y-2">
              <li><Link href="/floor" className="hover:text-emerald-400 transition-colors">Staff Hub PWA</Link></li>
              <li><Link href="/floor/scan" className="hover:text-emerald-400 transition-colors">Barcode Scanner</Link></li>
              <li><Link href="/shelf-health" className="hover:text-emerald-400 transition-colors">Shelf Vision Health</Link></li>
              <li><Link href="/floor/damage" className="hover:text-emerald-400 transition-colors">Offline Damage Log</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <span className="font-bold text-white uppercase tracking-wider text-xs font-mono">Executive & Admin</span>
            <ul className="space-y-2">
              <li><Link href="/manager" className="hover:text-emerald-400 transition-colors">Store Manager View</Link></li>
              <li><Link href="/manager/analytics" className="hover:text-emerald-400 transition-colors">Executive Analytics</Link></li>
              <li><Link href="/admin/pos-control-tower" className="hover:text-emerald-400 transition-colors">POS Control Tower</Link></li>
              <li><Link href="/admin/pos-connections" className="hover:text-emerald-400 transition-colors">Connector Registry</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <span className="font-bold text-white uppercase tracking-wider text-xs font-mono">System & Auth</span>
            <ul className="space-y-2">
              <li><Link href="/login" className="hover:text-emerald-400 transition-colors">Enterprise Sign In</Link></li>
              <li className="text-slate-500">SAP S/4HANA OData Engine</li>
              <li className="text-slate-500">Supabase Event Projections</li>
              <li className="text-emerald-400 font-mono">● All Systems Nominal</li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-900 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-500">
            © 2026 SmartStock LiveRetail. Enterprise Inventory Intelligence & ERP Synchronicity.
          </p>
          <div className="flex items-center gap-4 text-slate-500">
            <span>Tenant: default-tenant</span>
            <span>·</span>
            <span>Version 1.0.0 (Production)</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
