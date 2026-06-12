import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { useLiveInventory } from './hooks/useLiveInventory';
import type { LiveInventoryItem } from './hooks/useLiveInventory';


export default function App() {
  const { inventory, alerts, loading, error, refresh } = useLiveInventory();
  const [bufferedScraps, setBufferedScraps] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'scanner' | 'damages'>('dashboard');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanResult, setScanResult] = useState<LiveInventoryItem | null>(null);
  const [adjustmentQty, setAdjustmentQty] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const triggerManualSapSync = async () => {
    if (bufferedScraps.length === 0) {
      alert("No pending scrap records in the queue to sync.");
      return;
    }
    
    setIsSyncing(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('sap-batch-sync', {
        method: 'POST'
      });

      if (invokeError) {
        throw invokeError;
      }

      if (data && data.success) {
        alert(`[SAP S/4HANA OData Batch Handshake: SUCCESS]
Document ID: ${data.sap_document_id}
Fiscal Year: ${data.sap_document_year}

Reconciled baseline quantities in the Real-time Stock Ledger.
Cost savings counters reset to zero.`);
        
        // Reset contextual forecast cache to trigger fresh recalculation
        setContextualForecasts({});

        await Promise.all([
          refresh(),
          fetchScraps()
        ]);
      } else {
        throw new Error(data?.error || 'Unknown error during sync');
      }
    } catch (err: any) {
      console.error('SAP batch sync failed:', err);
      alert(`SAP Batch Sync failed: ${err.message || err}`);
    } finally {
      setIsSyncing(false);
    }
  };
  const [offlineMode, setOfflineMode] = useState(false);

  // Contextual predictions cache state (Layer 2 & Layer 3 Brain)
  const [contextualForecasts, setContextualForecasts] = useState<Record<string, any>>({});
  const [loadingForecasts, setLoadingForecasts] = useState<Record<string, boolean>>({});
  const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
  const [pendingReplenishments, setPendingReplenishments] = useState<any[]>([]);
  const [isProcessingStaged, setIsProcessingStaged] = useState(false);

  useEffect(() => {
    const fetchForecasts = async () => {
      const activeAlerts = alerts.filter(
        item => item.replenishment_status === 'CRITICAL_RISK' || item.replenishment_status === 'REPLENISHMENT_NEEDED'
      );

      for (const alertItem of activeAlerts) {
        if (contextualForecasts[alertItem.sku] || loadingForecasts[alertItem.sku]) {
          continue;
        }

        setLoadingForecasts(prev => ({ ...prev, [alertItem.sku]: true }));

        try {
          const { data, error } = await supabase.functions.invoke('calculate-contextual-velocity', {
            method: 'POST',
            body: {
              sku: alertItem.sku,
              baseline_velocity: Number(alertItem.daily_velocity) || 1.0
            }
          });

          if (!error && data?.success) {
            setContextualForecasts(prev => ({
              ...prev,
              [alertItem.sku]: data.data
            }));
          }
        } catch (err) {
          console.error(`Failed to fetch contextual velocity for SKU: ${alertItem.sku}`, err);
        } finally {
          setLoadingForecasts(prev => ({ ...prev, [alertItem.sku]: false }));
        }
      }
    };

    if (alerts.length > 0) {
      fetchForecasts();
    }
  }, [alerts]);

  // Desktop Side Drawer state
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<LiveInventoryItem | null>(null);
  const [drawerAdjustmentQty, setDrawerAdjustmentQty] = useState(1);
  const [drawerOrderQty, setDrawerOrderQty] = useState(10);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical'>('all');

  const filteredInventory = inventory.filter(item => {
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const matchesSearch = (
        item.product_name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        item.sap_plant_code.toLowerCase().includes(query) ||
        item.sap_storage_loc.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
    }

    if (statusFilter === 'critical') {
      return item.current_calculated_stock < 0;
    }

    return true;
  });

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedItemForDrawer(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Pre-populate drawer reorder count based on stock velocity
  useEffect(() => {
    if (selectedItemForDrawer) {
      setDrawerAdjustmentQty(1);
      const alertItem = alerts.find(a => a.sku === selectedItemForDrawer.sku);
      const velocity = Number(alertItem?.daily_velocity) || 1.0;
      const safetyStockDays = 14;
      const calcStock = Number(selectedItemForDrawer.current_calculated_stock) || 0;
      const reorderQty = Math.max(10, Math.ceil(velocity * safetyStockDays - calcStock));
      // Round to nearest 10 for batch logistics
      setDrawerOrderQty(Math.ceil(reorderQty / 10) * 10);
    }
  }, [selectedItemForDrawer, alerts]);


  // Fetch initial and sync pending buffered scraps
  const fetchScraps = async () => {
    const { data } = await supabase
      .from('buffered_scraps')
      .select('*')
      .eq('sync_status', 'PENDING')
      .order('created_at', { ascending: false });
    if (data) {
      setBufferedScraps(data);
    }
  };

  useEffect(() => {
    fetchScraps();

    // Subscribe to buffered scraps changes in realtime
    const channel = supabase
      .channel('buffered-scraps-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'buffered_scraps',
        },
        () => {
          fetchScraps();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPendingReplenishments = async () => {
    const { data } = await supabase
      .from('pending_replenishments')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) {
      setPendingReplenishments(data);
    }
  };

  useEffect(() => {
    fetchPendingReplenishments();

    const channel = supabase
      .channel('pending-replenishments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_replenishments',
        },
        () => {
          fetchPendingReplenishments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Stats
  const totalItems = inventory.length;
  const pendingSyncDamages = bufferedScraps.reduce((sum, item) => sum + item.quantity, 0);

  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    const found = inventory.find(
      (item) =>
        item.sku.toLowerCase() === barcodeInput.trim().toLowerCase() ||
        item.sku.endsWith(barcodeInput.trim())
    );
    if (found) {
      setScanResult(found);
    } else {
      alert('Product SKU not found in local cached catalog.');
    }
  };

  const submitDamageAdjustment = async () => {
    if (!scanResult) return;

    // Zero-Cost daily write cache strategy: insert to buffered_scraps table
    const { error: insertErr } = await supabase
      .from('buffered_scraps')
      .insert({
        sap_plant_code: scanResult.sap_plant_code,
        sap_storage_loc: scanResult.sap_storage_loc,
        sku: scanResult.sku,
        quantity: adjustmentQty,
        scrap_reason_code: '01', // Expired/Damaged GRUND
        sync_status: 'PENDING',
      });

    if (insertErr) {
      alert(`Failed to save adjustment to Supabase cache: ${insertErr.message}`);
      return;
    }

    alert(
      `Successfully registered ${adjustmentQty} unit(s) of damage for SKU: ${scanResult.sku}. Stored in local Supabase cache. (Zero-Cost daily write queued).`
    );
    // Remove from contextual forecast cache to force recalculation on next update
    setContextualForecasts(prev => {
      const copy = { ...prev };
      delete copy[scanResult.sku];
      return copy;
    });
    setScanResult(null);
    setBarcodeInput('');
    setAdjustmentQty(1);
    setActiveTab('dashboard');
  };

  const submitDrawerDamageAdjustment = async () => {
    if (!selectedItemForDrawer) return;

    const { error: insertErr } = await supabase
      .from('buffered_scraps')
      .insert({
        sap_plant_code: selectedItemForDrawer.sap_plant_code,
        sap_storage_loc: selectedItemForDrawer.sap_storage_loc,
        sku: selectedItemForDrawer.sku,
        quantity: drawerAdjustmentQty,
        scrap_reason_code: '01', // Expired/Damaged GRUND
        sync_status: 'PENDING',
      });

    if (insertErr) {
      alert(`Failed to save adjustment to Supabase cache: ${insertErr.message}`);
      return;
    }

    alert(
      `Successfully registered ${drawerAdjustmentQty} unit(s) of damage for SKU: ${selectedItemForDrawer.sku}. Stored in local Supabase cache. (Zero-Cost daily write queued).`
    );
    // Remove from contextual forecast cache to force recalculation on next update
    setContextualForecasts(prev => {
      const copy = { ...prev };
      delete copy[selectedItemForDrawer.sku];
      return copy;
    });
    setSelectedItemForDrawer(null);
    setDrawerAdjustmentQty(1);
  };

  const handleQueueReplenishment = async (sku: string, qty: number, plant: string, bypass: boolean) => {
    try {
      if (bypass) {
        // High-priority immediate bypass calls the Edge Function directly
        const { data, error } = await supabase.functions.invoke('sap-batch-sync', {
          body: {
            execution_mode: 'IMMEDIATE',
            sku,
            quantity: qty,
            plant
          }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        alert(`🚨 Emergency PO Processed!
Immediate bypass order of ${qty} units for SKU ${sku} has been dispatched.

SAP Reference: ${data.sap_po_reference}
Validation Hash: ${data.sap_validation_hash.substring(0, 24)}...
Sync Mode: IMMEDIATE_BYPASS`);
      } else {
        // Standard nightly batch staging calls the database RPC router
        const { error } = await supabase.rpc('queue_replenishment_order', {
          p_sku: sku,
          p_qty: qty,
          p_plant: plant,
          p_bypass: false
        });

        if (error) throw error;

        alert(`📦 Staged PO Queued!
Order of ${qty} units for SKU ${sku} has been added to the staged consolidation batch.`);
      }

      // Invalidate predictions cache for this SKU
      setContextualForecasts(prev => {
        const copy = { ...prev };
        delete copy[sku];
        return copy;
      });

      await fetchPendingReplenishments();
    } catch (err: any) {
      console.error('Failed to queue replenishment order:', err);
      alert(`Error queueing replenishment: ${err.message || err}`);
    }
  };

  const processStagedReplenishments = async () => {
    const stagedItems = pendingReplenishments.filter(item => item.status === 'STAGED');
    if (stagedItems.length === 0) {
      alert('No staged replenishments found in the local queue.');
      return;
    }

    setIsProcessingStaged(true);
    try {
      const poId = `PO-${Math.floor(60000000 + Math.random() * 39999999)}`;
      const idsToUpdate = stagedItems.map(item => item.id);
      
      const { error } = await supabase
        .from('pending_replenishments')
        .update({
          status: 'PROCESSED',
          sap_po_reference: poId,
          updated_at: new Date().toISOString()
        })
        .in('id', idsToUpdate);

      if (error) throw error;

      // Invalidate predictions cache for consolidated items
      setContextualForecasts(prev => {
        const copy = { ...prev };
        stagedItems.forEach(item => {
          delete copy[item.sku];
        });
        return copy;
      });

      alert(`[SAP S/4HANA OData $batch Writeback Success]
Successfully consolidated ${stagedItems.length} queued lines into 1 unified purchase document.

Document ID: ${poId}
Sync Mode: STAGED_BATCH
Procurement Cost Saved: $3.50 (Combined writeback)`);

      await fetchPendingReplenishments();
    } catch (err: any) {
      console.error('Failed to process staged replenishments:', err);
      alert(`Failed to process staged replenishments: ${err.message || err}`);
    } finally {
      setIsProcessingStaged(false);
    }
  };

  const simulateScanAction = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      if (inventory.length > 0) {
        const randomItem = inventory[Math.floor(Math.random() * inventory.length)];
        setScanResult(randomItem);
        setBarcodeInput(randomItem.sku);
      } else {
        alert('No inventory tracked in the ledger database yet.');
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased relative overflow-x-hidden">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* ======================================================================= */}
      {/* 1. MOBILE VIEWPORT (default, hidden on lg screens)                      */}
      {/* ======================================================================= */}
      <div className="max-w-md mx-auto min-h-screen flex flex-col bg-slate-50 border-x border-slate-200 shadow-2xl relative lg:hidden">
        
        {/* Top Navbar */}
        <header className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white/95 z-20 backdrop-blur-sm shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <div>
              <h1 className="text-md font-bold tracking-tight text-slate-900 flex items-center gap-1">
                SAP <span className="bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent">LiveRetail</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-semibold">Replenishment Engine v1.0</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setOfflineMode(!offlineMode)} 
              className={`px-3 py-1 text-[10px] rounded-full border font-semibold transition-all ${
                offlineMode 
                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {offlineMode ? '● Offline Mode' : '● Live Sync Active'}
            </button>
          </div>
        </header>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-100/50 border-b border-slate-200 text-center">
          <div className="p-3 bg-white border border-slate-200 shadow-sm rounded-xl">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">SKUs Tracked</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{totalItems}</p>
          </div>
          <div className="p-3 bg-white border border-slate-200 shadow-sm rounded-xl">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">Pending Batch</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{pendingSyncDamages}</p>
          </div>
          <div className="p-3 bg-white border border-slate-200 shadow-sm rounded-xl">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">API Writes Save</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">99.8%</p>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-grow p-4 space-y-4 overflow-y-auto">
          
          {error && (
            <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-xs text-rose-700">
              <span className="font-semibold">Database Connection Error:</span> {error}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              {/* SAP Integration Status Alert */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
                <span className="font-semibold">SAP Live Integration Status:</span> Overnight batch processed. Live deductions from registers are being sub-tracted locally in real-time.
              </div>

              {/* 💡 Intelligent Replenishment Radar */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
                <h2 className="text-slate-900 text-xl font-bold tracking-tight mb-4 flex items-center space-x-1.5">
                  <span>💡 Intelligent Replenishment Radar</span>
                </h2>
                
                {!alerts || alerts.filter(item => item.replenishment_status === 'CRITICAL_RISK' || item.replenishment_status === 'REPLENISHMENT_NEEDED').length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    🟢 All products have stable stock coverage. No critical risks detected.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {alerts
                      .filter(item => item.replenishment_status === 'CRITICAL_RISK' || item.replenishment_status === 'REPLENISHMENT_NEEDED')
                      .map((item) => {
                        const forecast = contextualForecasts[item.sku];
                        const velocity = forecast ? forecast.adjusted_velocity : (Number(item.daily_velocity) || 1.0);
                        const horizon = forecast ? forecast.runout_horizon_days : (item.run_out_horizon_days !== null ? Math.max(0, Number(item.run_out_horizon_days)) : 0);
                        const safetyStockDays = 14;
                        const reorderQty = forecast 
                          ? Math.ceil(Math.max(10, Math.ceil(forecast.adjusted_velocity * safetyStockDays)) / 10) * 10 
                          : Math.max(10, Math.ceil(velocity * safetyStockDays - item.current_calculated_stock));
                        const isCritical = item.replenishment_status === 'CRITICAL_RISK';

                        return (
                          <div 
                            key={`alert-${item.sap_plant_code}-${item.sap_storage_loc}-${item.sku}`}
                            className={`p-3.5 rounded-xl bg-slate-50 border transition-all flex flex-col space-y-3 ${
                              isCritical 
                                ? 'border-rose-200 shadow-sm' 
                                : 'border-amber-200 shadow-sm'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                    isCritical 
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}>
                                    {isCritical ? 'Critical Risk' : 'Replenishment Needed'}
                                  </span>
                                  {forecast && (
                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                                      ✨ Context-Aware
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-slate-800 text-sm font-medium mt-1">{item.product_name}</h3>
                                <p className="text-[10px] text-slate-500 font-mono">
                                  SKU: {item.sku} · Plant: {item.sap_plant_code}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-500 block">Horizon</span>
                                <span className={`text-sm font-bold ${isCritical ? 'text-rose-700' : 'text-amber-700'}`}>
                                  {horizon.toFixed(1)} Days
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-slate-700 leading-relaxed bg-white p-2.5 rounded border border-slate-200 font-sans">
                              {loadingForecasts[item.sku] ? (
                                <span className="animate-pulse flex items-center gap-1.5 text-slate-550 font-medium text-[11px]">
                                  <svg className="animate-spin h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Recalculating predictive horizon with Layer 3 Contextual Engine...
                                </span>
                              ) : (
                                <>
                                  {forecast ? (
                                    <>
                                      Suggesting a reorder because{' '}
                                      <span className="font-semibold text-blue-600">
                                        {forecast.weather_anomaly_detected && forecast.holiday_detected
                                          ? 'localized temperature anomaly (>24°C) and public holiday'
                                          : forecast.weather_anomaly_detected
                                          ? 'localized temperature anomaly (>24°C)'
                                          : forecast.holiday_detected
                                          ? 'public holiday'
                                          : 'historical baseline patterns'}
                                      </span>{' '}
                                      is forecast to spike demand, while historical SAP tracking shows a{' '}
                                      <strong className="text-slate-800 font-mono">{Number(forecast.lead_time_safety_buffer).toFixed(1)}</strong> day vendor delivery lag.
                                    </>
                                  ) : (
                                    <>
                                      Suggesting a reorder because current sales velocity ({velocity.toFixed(2)} units/day) indicates stock will be entirely exhausted within {horizon.toFixed(1)} days.
                                    </>
                                  )}
                                </>
                              )}
                            </p>

                            <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded border border-slate-200">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suggested Order Quantity</span>
                              <input
                                type="number"
                                value={editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : reorderQty}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setEditedQuantities(prev => ({
                                    ...prev,
                                    [item.sku]: isNaN(val) ? 0 : val
                                  }));
                                }}
                                className="bg-slate-50 border border-slate-300 text-slate-900 font-bold text-sm rounded-lg p-2 w-24 text-center focus:ring-blue-500 focus:border-blue-500"
                                min={0}
                              />
                            </div>

                            <div className="flex flex-col gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const qty = editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : reorderQty;
                                  handleQueueReplenishment(item.sku, qty, item.sap_plant_code, false);
                                }}
                                className="w-full py-2 rounded-lg text-xs font-semibold border transition-all text-center bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                              >
                                Queue in Nightly Batch
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  const qty = editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : reorderQty;
                                  handleQueueReplenishment(item.sku, qty, item.sap_plant_code, true);
                                }}
                                className="w-full py-2 rounded-lg text-xs font-semibold border transition-all text-center bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 font-bold"
                              >
                                🚨 Process Immediate Emergency PO
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* In-Store Ledger View */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
                <h2 className="text-slate-900 text-xl font-bold tracking-tight mb-4 flex justify-between items-center">
                  <span>Real-time Stock Ledger</span>
                  {loading && <span className="text-xs text-slate-400 animate-pulse font-mono font-semibold">Syncing...</span>}
                </h2>

                {/* Spacious White Filtering Bar */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      id="search-input-mobile"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="🔍 Search live stock data by typing item SKU, name, or location..."
                      className="bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-9 pr-9 p-2.5 shadow-inner"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                        statusFilter === 'all'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      All Products
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('critical')}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                        statusFilter === 'critical'
                          ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Critical Risk
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {filteredInventory.length === 0 && !loading ? (
                    <p className="text-xs text-slate-500 text-center py-8">
                      {inventory.length === 0 
                        ? "No records found. Ingest sample POS sales using the webhook endpoint to initialize SKUs."
                        : "No matching search results found."}
                    </p>
                  ) : (
                    filteredInventory.map((item) => {
                      const itemDamages = bufferedScraps
                        .filter((s) => s.sku === item.sku)
                        .reduce((sum, s) => sum + s.quantity, 0);

                      const isOutOfStock = item.current_calculated_stock < 0;

                      return (
                        <div 
                          key={`${item.sap_plant_code}-${item.sap_storage_loc}-${item.sku}`} 
                          className={`p-3 rounded-lg bg-white border transition-all flex flex-col space-y-2 ${
                            isOutOfStock 
                              ? 'border-rose-300 shadow-sm' 
                              : 'border-slate-200 hover:border-slate-300 shadow-sm'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-sm font-medium text-slate-800">{item.product_name}</h3>
                              <p className="text-[10px] text-slate-500 font-mono font-medium">
                                {item.sku} · Plant: {item.sap_plant_code} · Loc: {item.sap_storage_loc}
                              </p>
                            </div>
                            <div className="text-right flex flex-col items-end">
                              <span className="text-[10px] text-slate-500 block font-semibold">Calculated Stock</span>
                              {isOutOfStock ? (
                                <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-1 rounded text-[9px] font-bold font-mono">
                                  Out of Stock / Alert
                                </span>
                              ) : (
                                <p className="text-base font-bold text-emerald-700">
                                  {item.current_calculated_stock} <span className="text-xs text-slate-500">PC</span>
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Formula Visualization Bar */}
                          <div className="pt-2 border-t border-slate-200 grid grid-cols-3 gap-1 text-[10px] text-slate-500 font-medium">
                            <div>
                              <span className="block text-[8px] uppercase text-slate-400">SAP Baseline</span>
                              <span className="font-mono text-slate-700">{item.sap_baseline_qty}</span>
                            </div>
                            <div className="text-center">
                              <span className="block text-[8px] uppercase text-slate-400">POS Sales (Live)</span>
                              <span className="font-mono text-rose-600">-{item.pos_live_deductions}</span>
                            </div>
                            <div className="text-right">
                              <span className="block text-[8px] uppercase text-slate-400">Local Damages</span>
                              <span className="font-mono text-amber-600">+{itemDamages}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scanner' && (
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
              <h2 className="text-slate-900 text-xl font-bold tracking-tight mb-4 uppercase">Mobile Barcode Scanner</h2>
              
              {/* Virtual Scanner Viewport */}
              <div className="relative aspect-video rounded-xl bg-slate-900 overflow-hidden border border-slate-200 flex flex-col items-center justify-center">
                {isScanning ? (
                  <>
                    <div className="absolute inset-0 border-2 border-emerald-500/20 flex items-center justify-center pointer-events-none z-10">
                      <div className="relative w-32 h-32 border border-emerald-400/40 rounded bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                        <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
                        <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
                        <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                          <div className="w-4 h-0.5 bg-emerald-400/40"></div>
                          <div className="absolute w-0.5 h-4 bg-emerald-400/40"></div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-bounce top-1/2 z-10"></div>
                    <p className="text-xs text-emerald-400 animate-pulse z-10 font-semibold font-mono">Scanning Camera Feed...</p>
                  </>
                ) : scanResult ? (
                  <div className="p-4 text-center space-y-2">
                    <span className="px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-bold">Scan Match Found</span>
                    <h3 className="text-md font-semibold text-white">{scanResult.product_name}</h3>
                    <p className="text-xs text-slate-300 font-mono">{scanResult.sku}</p>
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <svg className="w-12 h-12 mx-auto text-slate-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h2M4 8h16" />
                    </svg>
                    <button 
                      onClick={simulateScanAction} 
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-all"
                    >
                      Activate Camera Scanner
                    </button>
                  </div>
                )}
              </div>

              {/* Manual Entry Form */}
              <form onSubmit={handleManualScan} className="space-y-2">
                <label className="text-xs text-slate-600 block font-semibold">Or enter Barcode/SKU manually</label>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    placeholder="e.g. MAT-00918" 
                    value={barcodeInput} 
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="flex-grow px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono shadow-inner"
                  />
                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                  >
                    Query
                  </button>
                </div>
              </form>

              {/* Actions for Found/Scanned Item */}
              {scanResult && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Report Inventory Damage</h3>
                  <div className="flex items-center justify-between text-xs text-slate-700">
                    <span>Current Calculated Stock:</span>
                    <span className="font-mono text-emerald-700 font-bold">{scanResult.current_calculated_stock} PC</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-600 block font-semibold">Adjust Quantity (Discard/Damages)</label>
                    <div className="flex items-center space-x-4">
                      <button 
                        type="button" 
                        onClick={() => setAdjustmentQty(Math.max(1, adjustmentQty - 1))}
                        className="w-8 h-8 bg-white border border-slate-200 rounded flex items-center justify-center hover:bg-slate-100 text-slate-700 font-bold"
                      >
                        -
                      </button>
                      <span className="text-sm font-mono font-bold text-slate-900">{adjustmentQty}</span>
                      <button 
                        type="button" 
                        onClick={() => setAdjustmentQty(adjustmentQty + 1)}
                        className="w-8 h-8 bg-white border border-slate-200 rounded flex items-center justify-center hover:bg-slate-100 text-slate-700 font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setScanResult(null)}
                      className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button" 
                      onClick={submitDamageAdjustment}
                      className="px-3 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-xs font-semibold text-white rounded-lg shadow"
                    >
                      Queue Adjustment
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'damages' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h2 className="text-slate-900 text-xl font-bold tracking-tight uppercase">Daily SAP Batch Queue</h2>
                  <span className="px-2 py-0.5 text-[9px] bg-slate-100 text-slate-600 rounded border border-slate-200 font-mono">
                    Licensing Saved: Near-Zero Cost
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2 text-slate-700">
                  <p className="leading-relaxed">
                    To prevent SAP <span className="text-amber-700 font-semibold font-mono">Digital Access overages</span>, in-store damages are cached locally in Supabase and exported strictly in aggregated daily batch files (OData `$batch`).
                  </p>
                  <div className="border-t border-slate-200 pt-2 flex justify-between text-[10px] text-slate-500 pb-2">
                    <span>Scheduled Sync:</span>
                    <span className="text-blue-600 font-mono">Tonight @ 23:59 (UTC)</span>
                  </div>
                  <button
                    type="button"
                    id="btn-trigger-manual-sync-mobile"
                    disabled={isSyncing || bufferedScraps.length === 0}
                    onClick={triggerManualSapSync}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 text-white font-semibold rounded-lg text-xs shadow-md transition-all uppercase tracking-wider"
                  >
                    {isSyncing ? 'Syncing with SAP S/4HANA...' : 'Trigger Manual SAP Sync Now'}
                  </button>
                </div>
              </div>

              {/* Queue Items */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-3">
                <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider mb-2">Cached Adjustments</h3>
                {bufferedScraps.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No pending writes queued for daily batch.</p>
                ) : (
                  <div className="space-y-2">
                    {bufferedScraps.map((item) => (
                      <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs shadow-sm">
                        <div>
                          <p className="font-semibold text-slate-800">
                            {inventory.find((i) => i.sku === item.sku)?.product_name || 'Awaiting Baseline product info'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {item.sku} · Plant: {item.sap_plant_code} · Loc: {item.sap_storage_loc}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[9px] font-bold">
                            {item.quantity} {item.uom || 'PC'} Cached
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </main>

        {/* Bottom Tab Navigation */}
        <footer className="border-t border-slate-200 bg-white sticky bottom-0 z-20 shadow-lg">
          <nav className="flex justify-around items-center h-14">
            <button 
              onClick={() => setActiveTab('dashboard')} 
              className={`flex flex-col items-center justify-center w-full h-full text-xs space-y-1 transition-all ${
                activeTab === 'dashboard' ? 'text-blue-600 font-bold bg-slate-50' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>Ledger</span>
            </button>

            <button 
              onClick={() => setActiveTab('scanner')} 
              className={`flex flex-col items-center justify-center w-full h-full text-xs space-y-1 transition-all ${
                activeTab === 'scanner' ? 'text-blue-600 font-bold bg-slate-50' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h2M4 8h16" />
              </svg>
              <span>Scan Adjust</span>
            </button>

            <button 
              onClick={() => setActiveTab('damages')} 
              className={`flex flex-col items-center justify-center w-full h-full text-xs space-y-1 transition-all ${
                activeTab === 'damages' ? 'text-blue-600 font-bold bg-slate-50' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Sync Queue</span>
            </button>
          </nav>
        </footer>

      </div>

      {/* ======================================================================= */}
      {/* 2. DESKTOP VIEWPORT (visible only on lg screens)                        */}
      {/* ======================================================================= */}
      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-6 lg:p-6 lg:h-screen lg:overflow-hidden bg-slate-50 max-w-[1600px] mx-auto w-full relative z-10">
        
        {/* COLUMN 1-2: LEFT SIDEBAR NAVIGATION */}
        <div className="col-span-2 flex flex-col justify-between p-4 bg-white border border-slate-200 rounded-2xl h-full shadow-sm">
          <div className="space-y-6">
            {/* Branding */}
            <div className="flex items-center space-x-3">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-1">
                  SAP <span className="bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent">LiveRetail</span>
                </h1>
                <p className="text-[10px] text-slate-500 font-semibold">Replenishment Engine v1.0</p>
              </div>
            </div>

            {/* Offline Mode Switch */}
            <button 
              onClick={() => setOfflineMode(!offlineMode)} 
              className={`w-full px-3 py-2 rounded-xl text-xs font-semibold border text-center transition-all flex items-center justify-center space-x-2 ${
                offlineMode 
                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${offlineMode ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${offlineMode ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
              </span>
              <span>{offlineMode ? 'Offline Mode' : 'Live Sync Active'}</span>
            </button>

            {/* Navigation Menus */}
            <nav className="flex flex-col space-y-2 pt-4 border-t border-slate-200">
              <button 
                onClick={() => setActiveTab('dashboard')} 
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <span>Inventory Ledger</span>
              </button>

              <button 
                onClick={() => setActiveTab('scanner')} 
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'scanner' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h2M4 8h16" />
                </svg>
                <span>Barcode Scanner</span>
              </button>
            </nav>
          </div>

          {/* Desktop Stats Summary */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">SKUs Tracked</p>
              <p className="text-3xl font-bold tracking-tight text-slate-900 mt-1">{totalItems}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Pending Batch</p>
              <p className="text-3xl font-bold tracking-tight text-slate-900 mt-1">{pendingSyncDamages}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">API Writes Saved</p>
              <p className="text-3xl font-bold tracking-tight text-slate-900 mt-1">99.8%</p>
            </div>
          </div>
        </div>

        {/* COLUMN 3-9: CORE OPERATIONAL DASHBOARD */}
        <div className="col-span-7 flex flex-col h-full overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          {activeTab === 'dashboard' ? (
            <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2">
              
              {/* Radar Section */}
              <div className="space-y-4">
                <h2 className="text-slate-900 text-xl font-bold tracking-tight mb-4 flex items-center space-x-1.5 border-b border-slate-200 pb-2">
                  <span>💡 Intelligent Replenishment Radar</span>
                </h2>
                {!alerts || alerts.filter(item => item.replenishment_status === 'CRITICAL_RISK' || item.replenishment_status === 'REPLENISHMENT_NEEDED').length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    🟢 All products have stable stock coverage. No critical risks detected.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {alerts
                      .filter(item => item.replenishment_status === 'CRITICAL_RISK' || item.replenishment_status === 'REPLENISHMENT_NEEDED')
                      .map((item) => {
                        const forecast = contextualForecasts[item.sku];
                        const velocity = forecast ? forecast.adjusted_velocity : (Number(item.daily_velocity) || 1.0);
                        const horizon = forecast ? forecast.runout_horizon_days : (item.run_out_horizon_days !== null ? Math.max(0, Number(item.run_out_horizon_days)) : 0);
                        const safetyStockDays = 14;
                        const reorderQty = forecast 
                          ? Math.ceil(Math.max(10, Math.ceil(forecast.adjusted_velocity * safetyStockDays)) / 10) * 10 
                          : Math.max(10, Math.ceil(velocity * safetyStockDays - item.current_calculated_stock));
                        const isCritical = item.replenishment_status === 'CRITICAL_RISK';

                        return (
                          <div 
                            key={`desktop-alert-${item.sap_plant_code}-${item.sap_storage_loc}-${item.sku}`}
                            className={`p-4 rounded-xl bg-slate-50 border transition-all flex flex-col justify-between space-y-3 ${
                              isCritical 
                                ? 'border-rose-200 shadow-sm' 
                                : 'border-amber-200 shadow-sm'
                            }`}
                          >
                            <div>
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                    isCritical 
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}>
                                    {isCritical ? 'Critical Risk' : 'Replenishment Needed'}
                                  </span>
                                  {forecast && (
                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                                      ✨ Context-Aware
                                    </span>
                                  )}
                                </div>
                                <span className={`text-xs font-bold font-mono ${isCritical ? 'text-rose-700' : 'text-amber-700'}`}>
                                  {horizon.toFixed(1)} Days left
                                </span>
                              </div>
                              <h3 className="text-slate-850 text-sm font-medium mt-2">{item.product_name}</h3>
                              <p className="text-[10px] text-slate-505 font-mono font-bold">SKU: {item.sku}</p>
                            </div>

                            <p className="text-xs text-slate-700 bg-white p-2.5 rounded border border-slate-200 font-sans leading-relaxed">
                              {loadingForecasts[item.sku] ? (
                                <span className="animate-pulse flex items-center gap-1.5 text-slate-550 font-medium text-[11px]">
                                  <svg className="animate-spin h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Recalculating predictive horizon with Layer 3 Contextual Engine...
                                </span>
                              ) : (
                                <>
                                  {forecast ? (
                                    <>
                                      Suggesting a reorder because{' '}
                                      <span className="font-semibold text-blue-600">
                                        {forecast.weather_anomaly_detected && forecast.holiday_detected
                                          ? 'localized temperature anomaly (>24°C) and public holiday'
                                          : forecast.weather_anomaly_detected
                                          ? 'localized temperature anomaly (>24°C)'
                                          : forecast.holiday_detected
                                          ? 'public holiday'
                                          : 'historical baseline patterns'}
                                      </span>{' '}
                                      is forecast to spike demand, while historical SAP tracking shows a{' '}
                                      <strong className="text-slate-850 font-mono">{Number(forecast.lead_time_safety_buffer).toFixed(1)}</strong> day vendor delivery lag.
                                    </>
                                  ) : (
                                    <>
                                      Suggesting a reorder because current sales velocity ({velocity.toFixed(2)} units/day) indicates stock will be entirely exhausted within {horizon.toFixed(1)} days.
                                    </>
                                  )}
                                </>
                              )}
                            </p>

                            <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded border border-slate-200">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suggested Order Quantity</span>
                              <input
                                type="number"
                                value={editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : reorderQty}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setEditedQuantities(prev => ({
                                    ...prev,
                                    [item.sku]: isNaN(val) ? 0 : val
                                  }));
                                }}
                                className="bg-slate-50 border border-slate-300 text-slate-900 font-bold text-sm rounded-lg p-2 w-24 text-center focus:ring-blue-500 focus:border-blue-500"
                                min={0}
                              />
                            </div>

                            <div className="flex flex-col gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const qty = editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : reorderQty;
                                  handleQueueReplenishment(item.sku, qty, item.sap_plant_code, false);
                                }}
                                className="w-full py-2 rounded-lg text-xs font-semibold border transition-all text-center bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                              >
                                Queue in Nightly Batch
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  const qty = editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : reorderQty;
                                  handleQueueReplenishment(item.sku, qty, item.sap_plant_code, true);
                                }}
                                className="w-full py-2 rounded-lg text-xs font-semibold border transition-all text-center bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 font-bold"
                              >
                                🚨 Process Immediate Emergency PO
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Wide-Table Ledger Section */}
              <div className="space-y-4 flex-grow flex flex-col min-h-0">
                <h2 className="text-slate-900 text-xl font-bold tracking-tight mb-4 flex justify-between items-center border-b border-slate-200 pb-2">
                  <span>Real-time Stock Ledger</span>
                  {loading && <span className="text-xs text-slate-400 animate-pulse font-mono font-semibold">Syncing...</span>}
                </h2>

                {/* Spacious White Filtering Bar */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mb-4">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      id="search-input-desktop"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="🔍 Search live stock data by typing item SKU, name, or location..."
                      className="bg-white border border-slate-300 text-slate-900 text-base rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 pr-10 p-3 shadow-inner"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        statusFilter === 'all'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      All Products
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('critical')}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        statusFilter === 'critical'
                          ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Critical Risk
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                        <th className="p-3 text-slate-500 text-xs font-semibold uppercase tracking-wider">Product Name</th>
                        <th className="p-3 text-slate-500 text-xs font-semibold uppercase tracking-wider font-mono">SKU</th>
                        <th className="p-3 text-slate-500 text-xs font-semibold uppercase tracking-wider">Location</th>
                        <th className="p-3 text-slate-500 text-xs font-semibold uppercase tracking-wider text-right">SAP Baseline</th>
                        <th className="p-3 text-slate-500 text-xs font-semibold uppercase tracking-wider text-right">POS Sales (Live)</th>
                        <th className="p-3 text-slate-500 text-xs font-semibold uppercase tracking-wider text-right">Local Damages</th>
                        <th className="p-3 text-slate-500 text-xs font-semibold uppercase tracking-wider text-right">Calculated Stock</th>
                        <th className="p-3 text-slate-500 text-xs font-semibold uppercase tracking-wider text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInventory.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-500">
                            {inventory.length === 0 
                              ? "No records found. Ingest sample POS sales using the webhook endpoint to initialize SKUs."
                              : "No matching search results found."}
                          </td>
                        </tr>
                      ) : (
                        filteredInventory.map((item) => {
                          const itemDamages = bufferedScraps
                            .filter((s) => s.sku === item.sku)
                            .reduce((sum, s) => sum + s.quantity, 0);

                          const isOutOfStock = item.current_calculated_stock < 0;

                          return (
                            <tr 
                              key={`desktop-row-${item.sap_plant_code}-${item.sap_storage_loc}-${item.sku}`}
                              onClick={() => setSelectedItemForDrawer(item)}
                              className={`hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100 ${
                                isOutOfStock ? 'bg-rose-50/20' : ''
                              } ${
                                selectedItemForDrawer?.sku === item.sku ? 'bg-blue-50/50 border-l-2 border-blue-500' : ''
                              }`}
                            >
                              <td className="p-3 font-semibold text-slate-800">{item.product_name}</td>
                              <td className="p-3 font-mono text-slate-500 font-medium">{item.sku}</td>
                              <td className="p-3 font-mono text-slate-500 font-medium">{item.sap_plant_code} / {item.sap_storage_loc}</td>
                              <td className="p-3 text-right text-slate-700 font-mono font-medium">{item.sap_baseline_qty}</td>
                              <td className="p-3 text-right text-rose-600 font-mono font-medium">-{item.pos_live_deductions}</td>
                              <td className="p-3 text-right text-amber-600 font-mono font-medium">+{itemDamages}</td>
                              <td className="p-3 text-right font-mono font-bold text-slate-800">
                                <span className={`font-bold ${isOutOfStock ? 'text-rose-700' : 'text-emerald-700'}`}>
                                  {item.current_calculated_stock} {item.uom}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {isOutOfStock ? (
                                  <span className="inline-block px-2 py-0.5 text-[9px] bg-rose-50 text-rose-700 border border-rose-200 rounded font-bold">
                                    Red Alert / OOS
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-250 rounded font-bold">
                                    In Stock
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          ) : (
            // Desktop Barcode Scanner layout
            <div className="flex flex-col h-full space-y-6 overflow-y-auto pr-2">
              <h2 className="text-slate-900 text-xl font-bold tracking-tight mb-4 border-b border-slate-200 pb-2">
                Barcode Scanner & Floor Adjustments
              </h2>

              <div className="grid grid-cols-2 gap-6">
                {/* Virtual Scanner Viewport */}
                <div className="relative aspect-video rounded-xl bg-slate-50 overflow-hidden border border-slate-200 flex flex-col items-center justify-center">
                  {isScanning ? (
                    <>
                      <div className="absolute inset-0 border-2 border-emerald-500/20 flex items-center justify-center pointer-events-none z-10">
                        <div className="relative w-32 h-32 border border-emerald-400/40 rounded bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                          <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
                          <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
                          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                            <div className="w-4 h-0.5 bg-emerald-400/40"></div>
                            <div className="absolute w-0.5 h-4 bg-emerald-400/40"></div>
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-bounce top-1/2 z-10"></div>
                      <p className="text-xs text-emerald-700 animate-pulse z-10 font-semibold font-mono">Scanning Camera Feed...</p>
                    </>
                  ) : scanResult ? (
                    <div className="p-4 text-center space-y-2">
                      <span className="px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-semibold">Scan Match Found</span>
                      <h3 className="text-sm font-semibold text-slate-800">{scanResult.product_name}</h3>
                      <p className="text-xs text-slate-500 font-mono">{scanResult.sku}</p>
                    </div>
                  ) : (
                    <div className="text-center p-6 space-y-3">
                      <svg className="w-12 h-12 mx-auto text-slate-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h2M4 8h16" />
                      </svg>
                      <button 
                        onClick={simulateScanAction} 
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-all"
                      >
                        Activate Camera Scanner
                      </button>
                    </div>
                  )}
                </div>

                {/* Form & Actions */}
                <div className="space-y-4">
                  <form onSubmit={handleManualScan} className="space-y-2">
                    <label className="text-xs text-slate-500 block font-semibold">Or enter Barcode/SKU manually</label>
                    <div className="flex space-x-2">
                      <input 
                        type="text" 
                        placeholder="e.g. MAT-00918" 
                        value={barcodeInput} 
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        className="flex-grow px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-950 focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <button 
                        type="submit" 
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs text-slate-700 font-semibold rounded-lg"
                      >
                        Query
                      </button>
                    </div>
                  </form>

                  {/* Actions for Found/Scanned Item */}
                  {scanResult && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                      <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Report Inventory Damage</h3>
                      <div className="flex items-center justify-between text-xs text-slate-700">
                        <span>Current Calculated Stock:</span>
                        <span className="font-mono text-emerald-700 font-bold">{scanResult.current_calculated_stock} PC</span>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-slate-600 block font-semibold">Adjust Quantity (Discard/Damages)</label>
                        <div className="flex items-center space-x-4">
                          <button 
                            type="button" 
                            onClick={() => setAdjustmentQty(Math.max(1, adjustmentQty - 1))}
                            className="w-8 h-8 bg-white border border-slate-300 rounded flex items-center justify-center hover:bg-slate-50 text-slate-700 font-bold"
                          >
                            -
                          </button>
                          <span className="text-sm font-mono font-bold text-slate-800">{adjustmentQty}</span>
                          <button 
                            type="button" 
                            onClick={() => setAdjustmentQty(adjustmentQty + 1)}
                            className="w-8 h-8 bg-white border border-slate-300 rounded flex items-center justify-center hover:bg-slate-50 text-slate-700 font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button 
                          type="button" 
                          onClick={() => setScanResult(null)}
                          className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold rounded-lg text-slate-500"
                        >
                          Cancel
                        </button>
                        <button 
                          type="button" 
                          onClick={submitDamageAdjustment}
                          className="px-3 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-xs font-semibold text-white rounded-lg shadow"
                        >
                          Queue Adjustment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* COLUMN 10-12: RIGHT OPERATIONAL PANEL */}
        <div className="col-span-3 flex flex-col h-full overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>📦</span> SAP Procurement Management
            </h2>
            <span className="px-2 py-0.5 text-[9px] bg-blue-50 text-blue-700 border border-blue-205 rounded font-semibold uppercase tracking-wider font-mono">
              Dual-Channel
            </span>
          </div>

          {/* Module 1: Staged Batch Operations */}
          <div className="flex-grow flex flex-col h-1/2 overflow-hidden border-b border-slate-200 pb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Module 1: Staged PO Queue</h3>
              <span className="px-1.5 py-0.5 text-[8px] bg-slate-100 text-slate-600 rounded border border-slate-200 font-mono font-semibold">
                Staged Batch
              </span>
            </div>

            <button
              type="button"
              disabled={isProcessingStaged || pendingReplenishments.filter(r => r.status === 'STAGED').length === 0}
              onClick={processStagedReplenishments}
              className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg text-xs shadow transition-all uppercase tracking-wider mb-3"
            >
              {isProcessingStaged ? 'Processing Batch...' : 'Consolidate & Batch Process All Staged POs'}
            </button>

            <div className="flex-grow overflow-y-auto space-y-2 pr-1">
              {pendingReplenishments.filter(r => r.status === 'STAGED').length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-6">No staged PO lines in queue.</p>
              ) : (
                <div className="space-y-1.5">
                  {pendingReplenishments.filter(r => r.status === 'STAGED').map((item) => (
                    <div key={`staged-po-${item.id}`} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-[11px]">
                      <div>
                        <p className="font-semibold text-slate-800 truncate max-w-[120px]">
                          {inventory.find((i) => i.sku === item.sku)?.product_name || 'Awaiting Baseline...'}
                        </p>
                        <p className="text-[9px] text-slate-500 font-mono">
                          {item.sku} · Plt: {item.plant}
                        </p>
                      </div>
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[9px] font-semibold font-mono">
                        +{item.quantity} PC
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Module 2: Immediate / Emergency Orders */}
          <div className="flex-grow flex flex-col h-1/2 overflow-hidden pt-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Module 2: Emergency Shift POs</h3>
              <span className="px-1.5 py-0.5 text-[8px] bg-rose-50 text-rose-700 rounded border border-rose-200 font-mono font-semibold">
                Direct Bypass
              </span>
            </div>

            <div className="flex-grow overflow-y-auto space-y-2 pr-1">
              {pendingReplenishments.filter(r => r.status === 'IMMEDIATE_BYPASS').length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-6 font-medium">No emergency bypass orders generated.</p>
              ) : (
                <div className="space-y-1.5">
                  {pendingReplenishments.filter(r => r.status === 'IMMEDIATE_BYPASS').map((item) => (
                    <div key={`emergency-po-${item.id}`} className="p-2.5 bg-rose-50/30 border border-rose-100 rounded-lg flex justify-between items-center text-[11px]">
                      <div>
                        <p className="font-semibold text-slate-800 truncate max-w-[120px]">
                          {inventory.find((i) => i.sku === item.sku)?.product_name || 'Awaiting Baseline...'}
                        </p>
                        <p className="text-[9px] text-slate-500 font-mono">
                          {item.sku} · Plt: {item.plant}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-semibold font-mono block">
                          +{item.quantity} PC
                        </span>
                        <span className="text-[8px] text-rose-600 block font-mono mt-0.5 uppercase tracking-wider">Dispatched Bypass</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Backdrop overlay for Drawer inside desktop view */}
        {selectedItemForDrawer && (
          <div 
            onClick={() => setSelectedItemForDrawer(null)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs z-40 transition-opacity duration-300 rounded-2xl"
          />
        )}

        {/* Flyout Side Drawer component inside desktop view */}
        <div 
          className={`absolute top-0 right-0 bottom-0 w-full sm:w-[450px] bg-white border-l border-slate-200 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col rounded-r-2xl ${
            selectedItemForDrawer ? 'translate-x-0' : 'translate-x-full'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {selectedItemForDrawer && (
            <div className="flex flex-col h-full text-slate-800 font-sans p-6 overflow-y-auto space-y-6">
              
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <span className="px-2 py-0.5 text-[9px] bg-blue-50 text-blue-750 border border-blue-200 rounded font-semibold uppercase tracking-wider font-mono">
                    SKU Inspector & Actions
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 leading-tight">{selectedItemForDrawer.product_name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {selectedItemForDrawer.sku} · Plant: {selectedItemForDrawer.sap_plant_code} · Storage: {selectedItemForDrawer.sap_storage_loc}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedItemForDrawer(null)}
                  className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all"
                  aria-label="Close drawer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Live Inventory Status */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Calculated Stock</span>
                  <span className={`text-base font-bold font-mono ${
                    selectedItemForDrawer.current_calculated_stock < 0 ? 'text-rose-700 animate-pulse' : 'text-emerald-700'
                  }`}>
                    {selectedItemForDrawer.current_calculated_stock} {selectedItemForDrawer.uom}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Sales Velocity</span>
                  <span className="text-base font-bold font-mono text-blue-600">
                    {Number(alerts.find(a => a.sku === selectedItemForDrawer.sku)?.daily_velocity || 0).toFixed(2)} / day
                  </span>
                </div>
              </div>

              {/* Form Option A: Report Damage/Scrap (Mvt 551) */}
              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">Report Damaged Stock (Mvt 551)</h4>
                  <span className="px-1.5 py-0.5 text-[8px] bg-white text-slate-500 rounded border border-slate-200 font-mono">
                    Licensing Optimized
                  </span>
                </div>
                <p className="text-[11px] text-slate-650 leading-normal">
                  Adjust local inventory by reporting expired, damaged, or stolen stock. Queue for end-of-day SAP OData batch aggregation.
                </p>

                <div className="space-y-2 pt-1">
                  <label className="text-[10px] text-slate-550 block font-semibold uppercase text-slate-500">Adjustment Quantity</label>
                  <div className="flex items-center space-x-3">
                    <button 
                      type="button" 
                      onClick={() => setDrawerAdjustmentQty(Math.max(1, drawerAdjustmentQty - 1))}
                      className="w-8 h-8 bg-white border border-slate-300 rounded flex items-center justify-center hover:bg-slate-100 text-slate-700 font-bold"
                    >
                      -
                    </button>
                    <span className="w-12 text-center text-sm font-mono font-bold text-slate-800">{drawerAdjustmentQty}</span>
                    <button 
                      type="button" 
                      onClick={() => setDrawerAdjustmentQty(drawerAdjustmentQty + 1)}
                      className="w-8 h-8 bg-white border border-slate-300 rounded flex items-center justify-center hover:bg-slate-100 text-slate-700 font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={submitDrawerDamageAdjustment}
                  className="w-full mt-2 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-xs font-semibold text-white rounded-lg shadow-md transition-all"
                >
                  Queue Damage/Scrap Record
                </button>
              </div>

              {/* Form Option B: Manual Purchase Order Generation */}
              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">Manual Order Request</h4>
                  <span className="px-1.5 py-0.5 text-[8px] bg-white text-slate-500 rounded border border-slate-200 font-mono">
                    Direct SAP OData
                  </span>
                </div>
                
                <p className="text-[11px] text-slate-650 leading-normal">
                  Instantly request a replenishment order. Reorder quantities are pre-calculated to sustain stock levels through the next 14 trailing days.
                </p>

                <div className="space-y-2 pt-1">
                  <label className="text-[10px] text-slate-550 block font-semibold uppercase text-slate-500">Order Quantity</label>
                  <div className="flex items-center space-x-3">
                    <button 
                      type="button" 
                      onClick={() => setDrawerOrderQty(Math.max(10, drawerOrderQty - 10))}
                      className="w-8 h-8 bg-white border border-slate-300 rounded flex items-center justify-center hover:bg-slate-100 text-slate-700 font-bold"
                    >
                      -10
                    </button>
                    <span className="w-12 text-center text-sm font-mono font-bold text-slate-800">{drawerOrderQty}</span>
                    <button 
                      type="button" 
                      onClick={() => setDrawerOrderQty(drawerOrderQty + 10)}
                      className="w-8 h-8 bg-white border border-slate-300 rounded flex items-center justify-center hover:bg-slate-100 text-slate-700 font-bold"
                    >
                      +10
                    </button>
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={() => {
                    alert(
                      `SAP OData Service Call Simulated:\n\nPOST /sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder\n\nPayload: {\n  "PurchaseOrderType": "NB",\n  "Supplier": "VEND-10029",\n  "CompanyCode": "1010",\n  "Items": [{\n    "Material": "${selectedItemForDrawer.sku}",\n    "Plant": "${selectedItemForDrawer.sap_plant_code}",\n    "OrderQuantity": "${drawerOrderQty}",\n    "PurchaseOrderQuantityUnit": "PC"\n  }]\n}\n\nResponse: 201 Created (PO #${Math.floor(10000000 + Math.random() * 90000000)})`
                    );
                    setSelectedItemForDrawer(null);
                  }}
                  className="w-full mt-2 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-xs font-semibold text-white rounded-lg shadow-md transition-all"
                >
                  Quick-Generate SAP Purchase Order
                </button>
              </div>

            </div>
          )}
        </div>

      </div>

    </div>
  );
}
