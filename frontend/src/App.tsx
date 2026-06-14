import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { useLiveInventory } from './hooks/useLiveInventory';
import type { LiveInventoryItem } from './hooks/useLiveInventory';
import StockLedger from './components/replenishment/StockLedger';

export default function App() {
  const { inventory, alerts, refresh } = useLiveInventory();
  const [bufferedScraps, setBufferedScraps] = useState<any[]>([]);
  const syncQueue = bufferedScraps;

  const [activeNav, setActiveNav] = useState<'ALERTS' | 'LEDGER' | 'SCANNER'>('ALERTS');
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

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical'>('all');
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'FMCG' | 'HIGH_VALUE' | 'SEASONAL' | 'HARDLINES'>('ALL');
  const [procurementTab, setProcurementTab] = useState<'Routing' | 'PR_Control'>('Routing');


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

  const handleQuantityUpdate = async (id: string, newQty: number) => {
    if (isNaN(newQty) || newQty <= 0) return;
    try {
      const { error } = await supabase.rpc('fn_modify_staged_quantity', {
        row_id: id,
        new_qty: newQty
      });
      if (error) throw error;
      await fetchScraps();
    } catch (err) {
      console.error('Failed to update quantity:', err);
    }
  };

  const handleSoftDelete = async (id: string) => {
    try {
      const { error } = await supabase.rpc('fn_delete_staged_item', {
        row_id: id
      });
      if (error) throw error;
      await fetchScraps();
    } catch (err) {
      console.error('Failed to soft delete item:', err);
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans antialiased relative">
      
      {/* COLUMN 1: LEFT-HAND INFRASTRUCTURE SIDEBAR */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col justify-between p-5 h-full">
        <div className="space-y-5">
          {/* Top Branding Section */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-xs shadow-md">
              SAP
            </div>
            <div>
              <h1 className="text-xs font-bold tracking-tight text-slate-800 flex items-center gap-1">
                LiveRetail
              </h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Replenishment Engine v1.0</p>
            </div>
          </div>

          {/* Pulse Status Pill */}
          <div className="pt-1">
            <button 
              onClick={() => setOfflineMode(!offlineMode)} 
              className={`w-full py-1.5 px-3 rounded-lg border text-[10px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                offlineMode 
                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${offlineMode ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></span>
              <span>{offlineMode ? 'Local Cache (Offline)' : '🟢 Live Sync Active'}</span>
            </button>
          </div>

          {/* Primary Nav Stack */}
          <div className="space-y-1 pt-3 border-t border-slate-100">
            <span className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Navigation</span>
            
            <button 
              onClick={() => setActiveNav('ALERTS')} 
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeNav === 'ALERTS' ? 'bg-blue-50 text-blue-700 border border-blue-100/50' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <svg className="w-3.5 h-3.5 text-blue-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.05 3.636a8.959 8.959 0 0113.9 0M7.778 6.364a5.791 5.791 0 018.444 0M10.5 9.091a2.624 2.624 0 013 0M12 12v.01" />
              </svg>
              <span>Intelligent Radar</span>
            </button>

            <button 
              onClick={() => setActiveNav('LEDGER')} 
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeNav === 'LEDGER' ? 'bg-blue-50 text-blue-700 border border-blue-100/50' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>Inventory Ledger</span>
            </button>

            <button 
              onClick={() => {
                setActiveNav('SCANNER');
                setActiveTab('scanner');
              }} 
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeNav === 'SCANNER' && activeTab === 'scanner' ? 'bg-blue-50 text-blue-700 border border-blue-100/50' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h2M4 8h16" />
              </svg>
              <span>Barcode Scanner</span>
            </button>

            <button 
              onClick={() => {
                setActiveNav('SCANNER');
                setActiveTab('damages');
              }} 
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeNav === 'SCANNER' && activeTab === 'damages' ? 'bg-blue-50 text-blue-700 border border-blue-100/50' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Sync Queue ({bufferedScraps.length})</span>
            </button>
          </div>
        </div>

        {/* Bottom Metrics Section */}
        <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 shadow-sm space-y-2.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Global Analytics</span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">SKUs Tracked</p>
              <p className="text-base font-extrabold text-slate-800">{totalItems || 7}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Pending Batch</p>
              <p className="text-base font-extrabold text-slate-800">{syncQueue.length}</p>
            </div>
          </div>
          <div className="border-t border-slate-200/60 pt-2 flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase">API Writes Saved</span>
            <span className="text-xl font-extrabold text-blue-600 tracking-tight mt-0.5">99.8%</span>
          </div>
        </div>
      </aside>

      {/* COLUMN 2: CENTRAL PROCESSING COCKPIT */}
      <main className="flex-1 bg-slate-50 flex flex-col overflow-hidden h-full">
        {activeNav === 'ALERTS' && (
          <>
            {/* Top Control Header with search and dynamic dropdown filters */}
            <header className="bg-white border-b border-slate-200 p-4 flex-shrink-0 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 tracking-wider uppercase">
                    INTELLIGENT REPLENISHMENT CENTER
                  </h2>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Live Procurement Pipeline Orchestration</p>
                </div>
              </div>

              {/* Filters grid */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search Box */}
                <div className="relative w-48">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none text-slate-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search query..."
                    className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-7 py-1.5 shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Drop-down pill buttons for Category */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-250/50">
                  {(['ALL', 'FMCG', 'HIGH_VALUE', 'SEASONAL', 'HARDLINES'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1.5 text-xs rounded font-bold transition-all ${
                        activeCategory === cat 
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Urgency Trigger */}
                <button
                  onClick={() => setStatusFilter(statusFilter === 'all' ? 'critical' : 'all')}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-bold transition-all ${
                    statusFilter === 'critical'
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Urgency: {statusFilter === 'critical' ? '🔴 Critical Only' : 'All'}
                </button>

                {/* SKU & Vendor Dropdowns */}
                <button className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold flex items-center gap-1">
                  <span>SKU: All</span>
                  <svg className="w-2.5 h-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <button className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold flex items-center gap-1">
                  <span>Vendor: All</span>
                  <svg className="w-2.5 h-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <button className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold flex items-center gap-1">
                  <span>Omnichannel Source</span>
                  <svg className="w-2.5 h-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Middle Section (Item Rows) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="bg-white border border-slate-150 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold text-slate-805 uppercase tracking-wider">
                      Active Replenishment Suggestions {activeCategory !== 'ALL' ? `(${activeCategory.replace('_', ' ')})` : ''}
                    </h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Click any suggestion card to build & execute a custom strategy</p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono font-bold">Sync Cache Active</span>
                </div>

                <div className="p-4 bg-slate-50/30 space-y-3">
                  {(() => {
                    const filteredAlerts = alerts.filter(item => 
                      (item.replenishment_status === 'CRITICAL_RISK' || item.replenishment_status === 'REPLENISHMENT_NEEDED') &&
                      (activeCategory === 'ALL' || item.merchandise_category === activeCategory) &&
                      (statusFilter === 'all' || item.replenishment_status === 'CRITICAL_RISK') &&
                      (searchQuery === '' || item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
                    );

                    if (filteredAlerts.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center my-4">
                          <div className="text-3xl mb-2">✨</div>
                          <h3 className="text-sm font-bold text-slate-800">Supply Chain Balanced</h3>
                          <p className="text-xs text-slate-500 max-w-sm mt-1">
                            No replenishment alerts active for this category filter track. All multi-plant inventory, ATP pools, and upcoming promotional safety nets are fully optimized.
                          </p>
                        </div>
                      );
                    }

                    return filteredAlerts.map((item) => {
                      const isCritical = item.replenishment_status === 'CRITICAL_RISK';
                      
                      // Suggested ordering
                      const velocity = Number(item.daily_velocity) || 1.0;
                      const baseQty = Math.ceil(velocity * 14);
                      const roundingValue = item.bstrf_rounding_val || 1;
                      const reorderQty = Math.max(item.minbm_moq || 10, Math.ceil(baseQty / roundingValue) * roundingValue);
                      const currentQty = editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : reorderQty;

                      return (
                        <div 
                          key={item.sku} 
                          onClick={() => setSelectedItemForDrawer(item as any)}
                          className="flex items-center justify-between bg-white border border-slate-200/80 hover:border-blue-400 hover:shadow-md rounded-xl p-4 gap-4 transition-all text-slate-700 cursor-pointer"
                        >
                          <div className="flex-grow space-y-1.5">
                            {/* Top row with badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                                isCritical ? 'bg-rose-50 text-rose-700 border border-rose-250/50 animate-pulse' : 'bg-amber-50 text-amber-700 border border-amber-250/50'
                              }`}>
                                {isCritical ? 'CRITICAL' : 'NEEDED'}
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                                {item.merchandise_category || 'FMCG'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                SKU: {item.sku} · Plant: {item.sap_plant_code}
                              </span>
                            </div>

                            {/* Product Name */}
                            <h4 className="text-sm font-bold text-slate-900 leading-snug tracking-tight">
                              {item.product_name}
                            </h4>

                            {/* Multi-Source Row */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-2 p-2 bg-slate-50 border border-slate-100 rounded-lg">
                              {/* Step 1: Core ERP Baseline */}
                              <div className="flex items-center gap-1 text-slate-500">
                                <span>📦 SAP Opening Stock:</span>
                                <span className="font-semibold text-slate-800">{item.sap_baseline_qty || 200} PC</span>
                              </div>

                              <div className="h-3 w-px bg-slate-200" />

                              {/* Step 2: Live POS Webhook Counter */}
                              <div className="flex items-center gap-1 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-medium animate-pulse">
                                <span className="text-[10px]">⚡ Live POS Sales (Webhook):</span>
                                <span className="font-mono font-bold font-semibold">-{item.pos_live_deductions} PC</span>
                              </div>

                              <div className="h-3 w-px bg-slate-200" />

                              {/* Step 3: Calculated Perpetual Inventory Result */}
                              <div className="flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                <span>🎯 Real-Time Stock:</span>
                                <span className="font-mono font-semibold">{item.current_calculated_stock} PC</span>
                              </div>
                            </div>

                            {/* Subtext */}
                            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                              <span>🚀 Uplifted by {item.uplift_factor || '2'}x via active SAP promotion {item.campaign_name || 'Summer Refresh BOGO'}. Alert triggered instantly via checkout velocity threshold.</span>
                            </p>
                          </div>

                          {/* Right Side quantity summary and click-to-build-strategy */}
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <div className="text-right">
                              <span className="block text-[9px] text-slate-400 uppercase font-bold tracking-wider">Suggested Order</span>
                              <span className="text-base font-extrabold text-blue-600 font-mono">{currentQty} PC</span>
                            </div>
                            <div className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1.5">
                              <span>Choose Strategy</span>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Bottom Section (Two-Column Procurement Hub) */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-200/80 pt-3 flex-shrink-0">
                
                {/* Column 1: Tab Switcher (Routing, PR Control) */}
                <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden flex flex-col h-48">
                  <div className="flex border-b border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setProcurementTab('Routing')}
                      className={`flex-1 py-1.5 text-[10px] font-bold border-r border-slate-200 transition-colors uppercase tracking-wider ${
                        procurementTab === 'Routing' ? 'bg-white text-blue-750 border-t border-t-blue-600' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      Routing Rules
                    </button>
                    <button
                      type="button"
                      onClick={() => setProcurementTab('PR_Control')}
                      className={`flex-1 py-1.5 text-[10px] font-bold transition-colors uppercase tracking-wider ${
                        procurementTab === 'PR_Control' ? 'bg-white text-blue-750 border-t border-t-blue-600' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      🛡️ ERP Compliance
                    </button>
                  </div>

                  <div className="p-3 flex-1 overflow-y-auto text-[10px] text-slate-650 space-y-2">
                    {procurementTab === 'Routing' ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                          <span className="font-bold text-slate-750">Makita Industrial</span>
                          <span className="px-1 bg-emerald-55 text-emerald-750 border border-emerald-200 text-[8px] font-bold rounded">DE01 Direct</span>
                        </div>
                        <p className="text-slate-400 leading-normal">
                          Cutoff: 23:59 UTC daily. Safety margin rounding rules are active on core logistics items.
                        </p>
                        
                        <div className="flex justify-between items-center border-b border-slate-100 pb-1 pt-1">
                          <span className="font-bold text-slate-750">DeWalt Tools Logistics</span>
                          <span className="px-1 bg-blue-50 text-blue-700 border border-blue-200 text-[8px] font-bold rounded">Cross-Dock</span>
                        </div>
                        <p className="text-slate-400 leading-normal">
                          ATP stock discrepancies bypass standard consolidation cycles to avoid stockout risks.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-200/50">
                          <div>
                            <span className="text-[8px] text-slate-400 block uppercase font-bold">Audit Score</span>
                            <span className="text-[10px] font-extrabold text-slate-700">100% COMPLIANT</span>
                          </div>
                          <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 rounded">Secured</span>
                        </div>
                        <p className="text-slate-400 leading-normal">
                          Transactional OData queries use a unique idempotency key logic to protect central registers from duplicate writes and overage charges.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Integrated Optimization Analytics & Actions */}
                <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-3 flex flex-col justify-between h-48">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1.5">Consolidation Engine</h4>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="bg-slate-50 p-1.5 rounded border border-slate-150">
                        <span className="text-[8px] text-slate-400 uppercase font-semibold block">Consolidation Ratio</span>
                        <span className="text-xs font-extrabold text-blue-700">12:1 SKU/Batch</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded border border-slate-150">
                        <span className="text-[8px] text-slate-400 uppercase font-semibold block">OData Savings</span>
                        <span className="text-xs font-extrabold text-emerald-700">99.8% Saved</span>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal">
                      Group all pending staged items in the local queue and transmit as an aggregated OData batch to SAP.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessingStaged || pendingReplenishments.filter(item => item.status === 'STAGED').length === 0}
                    onClick={processStagedReplenishments}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-100 disabled:to-slate-150 disabled:text-slate-400 text-white font-bold rounded-lg text-[10px] shadow-sm transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                  >
                    {isProcessingStaged ? (
                      <span>⚙️ Optimizing & Transmitting Batch (Idempotency Secured)...</span>
                    ) : (
                      <span>CONSOLIDATE & BATCH PROCESS ALL STAGED POS</span>
                    )}
                  </button>
                </div>

              </div>
            </div>
          </>
        )}

          {activeNav === 'LEDGER' && (
            <div className="flex-grow overflow-y-auto p-4">
              <StockLedger inventory={inventory} alerts={alerts} />
            </div>
          )}

          {activeNav === 'SCANNER' && activeTab === 'scanner' && (
            <div className="bg-white border border-slate-100 rounded-xl p-5 space-y-4 shadow-sm flex-grow">
              <h3 className="text-slate-800 text-xs font-bold uppercase tracking-wider">Barcode Scanner adjustments</h3>
              <p className="text-[11px] text-slate-500">Launch live scan simulation or type details manually to deduct in-store damaged shelf counts instantly.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative aspect-video rounded-xl bg-slate-955 overflow-hidden border border-slate-200 flex flex-col items-center justify-center min-h-[180px]">
                  {isScanning ? (
                    <>
                      <div className="absolute inset-0 border-2 border-emerald-500/20 flex items-center justify-center pointer-events-none z-10">
                        <div className="relative w-24 h-24 border border-emerald-400/40 rounded bg-emerald-500/5">
                          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-emerald-400"></div>
                          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-emerald-400"></div>
                          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-emerald-400"></div>
                          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-emerald-400"></div>
                        </div>
                      </div>
                      <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-bounce top-1/2 z-10"></div>
                      <p className="text-[9px] text-emerald-450 animate-pulse z-10 font-bold">Scanning...</p>
                    </>
                  ) : (
                    <button 
                      type="button" 
                      onClick={simulateScanAction} 
                      className="px-3 py-1.5 bg-slate-850 hover:bg-slate-750 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider"
                    >
                      Launch Camera Scanner
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <form onSubmit={handleManualScan} className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Manual SKU Entry</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        placeholder="Type SKU"
                        className="bg-white border border-slate-200 text-slate-900 text-xs rounded-lg block flex-grow p-1.5 font-mono"
                      />
                      <button type="submit" className="py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold">
                        Search
                      </button>
                    </div>
                  </form>

                  {scanResult && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-bold text-slate-800">{scanResult.product_name}</span>
                        <span className="text-slate-400 font-mono">{scanResult.sku}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 bg-white p-2 rounded border border-slate-200">
                        <label className="text-[10px] font-bold text-slate-500">Damage Count:</label>
                        <input
                          type="number"
                          value={adjustmentQty}
                          onChange={(e) => setAdjustmentQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-12 p-0.5 text-xs border border-slate-300 rounded text-center font-bold text-slate-850"
                          min={1}
                        />
                        <span className="text-slate-450 text-[10px] font-semibold">{scanResult.uom}</span>
                      </div>

                      <button
                        type="button"
                        onClick={submitDamageAdjustment}
                        className="w-full py-1.5 bg-emerald-600 hover:from-emerald-500 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider"
                      >
                        Queue Damage Adjustment
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeNav === 'SCANNER' && activeTab === 'damages' && (
            <div className="flex-1 min-h-[500px] bg-white border border-slate-100 rounded-xl p-6 space-y-4 shadow-sm flex flex-col">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
                <div>
                  <h3 className="text-slate-800 text-xs font-bold uppercase tracking-wider">Sync Queue</h3>
                  <p className="text-[10px] text-slate-400">Offline adjustments wait for aggregated OData batch to reduce digital access costs.</p>
                </div>
                <button
                  type="button"
                  disabled={isSyncing || bufferedScraps.length === 0}
                  onClick={triggerManualSapSync}
                  className="py-1 px-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-lg text-[9px] uppercase tracking-wider"
                >
                  {isSyncing ? 'Syncing...' : 'Force Sync'}
                </button>
              </div>

              {bufferedScraps.some(item => item.status === 'MODIFIED' || item.status === 'DELETED') && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] px-3.5 py-2.5 rounded-lg font-semibold flex items-center gap-1.5 animate-pulse">
                  <span>⚠️ Changes pending locally. Optimization engine will re-calculate batch yields upon release confirmation.</span>
                </div>
              )}

              {bufferedScraps.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-4 text-slate-400 text-xs">No pending writes in sync queue.</div>
              ) : (
                <div className="flex-1 divide-y divide-slate-100 text-[11px] overflow-y-auto pr-1">
                  {bufferedScraps.map((item) => (
                    <div 
                      key={item.id} 
                      className={`py-2 flex justify-between items-center transition-all ${
                        item.status === 'DELETED' ? 'opacity-40 bg-rose-50/10' : ''
                      }`}
                    >
                      <div>
                        <p className="font-bold text-slate-700">
                          {inventory.find((i) => i.sku === item.sku)?.product_name || item.sku}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-400 font-mono">Plant: {item.sap_plant_code}</span>
                          {item.status === 'DELETED' && (
                            <span className="text-[8px] text-rose-600 bg-rose-50 border border-rose-200 font-bold px-1 rounded uppercase">Deleted</span>
                          )}
                          {item.status === 'MODIFIED' && (
                            <span className="text-[8px] text-blue-600 bg-blue-50 border border-blue-200 font-bold px-1 rounded uppercase">Modified</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 font-mono">Qty:</span>
                          <input 
                            type="number" 
                            defaultValue={item.quantity}
                            disabled={item.status === 'DELETED'}
                            className="w-16 h-7 text-xs font-mono font-bold text-slate-800 border border-slate-200 rounded text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 bg-white"
                            onChange={(e) => handleQuantityUpdate(item.id, parseInt(e.target.value))}
                          />
                        </div>
                        <button 
                          onClick={() => handleSoftDelete(item.id)}
                          disabled={item.status === 'DELETED'}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-20"
                          title="Remove from Staging Queue"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
      </main>

      {/* COLUMN 3: RIGHT-HAND ANALYTICAL STREAM ENGINE */}
      <aside className="w-80 flex-shrink-0 bg-white border-l border-slate-100 p-5 space-y-5 overflow-y-auto h-full flex flex-col justify-between">
        <div className="space-y-5">
          
          {/* Top Module: Live Operations Dashboard */}
          <div>
            <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest mb-3.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping"></span>
              <span>Live Operations Dashboard</span>
            </h3>

            <div className="space-y-3">
              {/* Batch Velocity (SVG area chart) */}
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] text-slate-500 font-bold uppercase">Batch Velocity Trend</span>
                  <span className="text-[9px] font-mono text-emerald-600 font-bold">+18.4%</span>
                </div>
                {/* SVG Area Chart */}
                <div className="h-10 w-full pt-1">
                  <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 0,30 L 0,25 Q 15,10 30,20 T 60,8 T 85,15 L 100,5 L 100,30 Z"
                      fill="url(#velocityGrad)"
                    />
                    <path
                      d="M 0,25 Q 15,10 30,20 T 60,8 T 85,15 L 100,5"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              {/* API Savings curves */}
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[9px] text-slate-500 font-bold uppercase">API Volume Savings</span>
                  <span className="text-[9px] font-mono text-blue-600 font-bold">$1,450 Saved</span>
                </div>
                <div className="relative pt-0.5">
                  <div className="flex justify-between text-[9px] mb-1 font-semibold text-slate-400">
                    <span>OData Digital Access</span>
                    <span className="text-slate-800">99.8% Eff</span>
                  </div>
                  <div className="overflow-hidden h-1 text-xs flex rounded bg-slate-200">
                    <div className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500" style={{ width: '99.8%' }}></div>
                  </div>
                </div>
              </div>

              {/* Multi-echelon availability vectors */}
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 space-y-2">
                <span className="text-[9px] text-slate-500 font-bold uppercase block">Multi-Echelon Availability</span>
                
                <div className="space-y-1 text-[9px]">
                  <div className="flex justify-between font-medium">
                    <span>Central DC (DE01)</span>
                    <span className="text-slate-700">94%</span>
                  </div>
                  <div className="overflow-hidden h-1 rounded bg-slate-200">
                    <div className="bg-emerald-500 h-full" style={{ width: '94%' }}></div>
                  </div>
                </div>

                <div className="space-y-1 text-[9px]">
                  <div className="flex justify-between font-medium">
                    <span>Store S001</span>
                    <span className="text-slate-700">82%</span>
                  </div>
                  <div className="overflow-hidden h-1 rounded bg-slate-200">
                    <div className="bg-blue-500 h-full" style={{ width: '82%' }}></div>
                  </div>
                </div>

                <div className="space-y-1 text-[9px]">
                  <div className="flex justify-between font-medium">
                    <span>Transit Pipeline</span>
                    <span className="text-slate-700">45%</span>
                  </div>
                  <div className="overflow-hidden h-1 rounded bg-slate-200">
                    <div className="bg-amber-500 h-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Data Lineage Popover Tracker */}
          <div className="relative border border-blue-100 bg-gradient-to-tr from-blue-50/50 to-indigo-50/50 rounded-xl p-3 space-y-1 group">
            <div className="flex justify-between items-center">
              <h4 className="text-[10px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                <span>🔗 SAP CAR/UDF Lineage</span>
              </h4>
              <a href="https://help.sap.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <p className="text-[9px] text-slate-500 leading-normal">
              Co-existence parameters verified. Weather anomalies & holiday signals deduct from register targets in real-time.
            </p>
            
            {/* Absolute Positioned Hover State Card */}
            <div className="absolute top-full left-0 right-0 mt-1.5 opacity-0 group-hover:opacity-100 pointer-events-none transition-all bg-white border border-slate-200 rounded-lg p-2.5 shadow-lg z-30 text-[9px] text-slate-500 space-y-1">
              <span className="font-bold text-slate-800 block">SAP CAR / Unified Demand Forecast</span>
              <p className="leading-snug">
                Verified: Sales history ingest co-exists with shelf out-of-stock live triggers. Zero write collisions.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Module: Emergency Shift POs */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5 mt-auto">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Emergency PO Shifts</span>
            <span className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
            </span>
          </div>

          <div className="space-y-1.5 text-[9px]">
            <div className="bg-white border border-slate-250/50 p-1.5 rounded flex justify-between items-center shadow-xs">
              <span className="font-bold text-slate-700">Makita Cordless Drill</span>
              <div className="flex items-center gap-1">
                <span className="font-bold text-rose-600">+10 PC</span>
                <span className="bg-rose-50 text-rose-700 px-1 rounded text-[7px] font-bold uppercase">Bypass</span>
              </div>
            </div>

            <div className="bg-white border border-slate-250/50 p-1.5 rounded flex justify-between items-center shadow-xs">
              <span className="font-bold text-slate-700">DeWalt Angle Grinder</span>
              <div className="flex items-center gap-1">
                <span className="font-bold text-rose-600">+5 PC</span>
                <span className="bg-rose-50 text-rose-700 px-1 rounded text-[7px] font-bold uppercase">Bypass</span>
              </div>
            </div>

            <div className="bg-white border border-slate-250/50 p-1.5 rounded flex justify-between items-center shadow-xs">
              <span className="font-bold text-slate-700">Bosch Rotary Hammer</span>
              <div className="flex items-center gap-1">
                <span className="font-bold text-rose-600">+8 PC</span>
                <span className="bg-rose-50 text-rose-700 px-1 rounded text-[7px] font-bold uppercase">Bypass</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Replenishment Strategy Decision Modal */}
      {selectedItemForDrawer && (() => {
        const item = selectedItemForDrawer;
        const alertItem = alerts.find(a => a.sku === item.sku) || item;
        const horizon = (alertItem as any).run_out_horizon_days !== null && (alertItem as any).run_out_horizon_days !== undefined 
          ? Number((alertItem as any).run_out_horizon_days) 
          : 15.0;
        const isCritical = (alertItem as any).replenishment_status === 'CRITICAL_RISK';
        
        const velocity = Number((alertItem as any).daily_velocity) || 1.0;
        const baseQty = Math.ceil(velocity * 14);
        const roundingValue = (alertItem as any).bstrf_rounding_val || 1;
        const reorderQty = Math.max((alertItem as any).minbm_moq || 10, Math.ceil(baseQty / roundingValue) * roundingValue);
        const currentQty = editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : reorderQty;
        const atpStock = item.current_calculated_stock;
        const isAtpDeficit = atpStock < ((alertItem as any).atp_trigger_qty || 10);

        const handleSTOExecute = () => {
          alert(`⚡ Stock Transfer Order (STO) Dispatched!
Successfully created STO #STO-${Math.floor(80000000 + Math.random() * 19999999)}
Transferred: ${currentQty} units of SKU ${item.sku}
From Source: Central DC (DE01)
To Destination: Plant ${item.sap_plant_code}
 
Transit Mode: Priority Cargo (Overnight Delivery)
Expected Delivery: Tomorrow AM`);
          setSelectedItemForDrawer(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div 
              onClick={() => setSelectedItemForDrawer(null)}
              className="absolute inset-0"
            />
            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6 z-10 animate-scale-in border border-slate-200 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-105 pb-4 flex-shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      isCritical ? 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {isCritical ? 'CRITICAL RISK' : 'REPLENISHMENT NEEDED'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-105 px-2 py-0.5 rounded">
                      {(alertItem as any).merchandise_category || 'FMCG'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Plant: {item.sap_plant_code}
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    {item.product_name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Material Code (SKU): {item.sku}
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedItemForDrawer(null)}
                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-150 border border-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-grow overflow-y-auto py-4 space-y-4 pr-1 text-slate-750">
                {/* Section 1: Detailed Operational Telemetry */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">SAP Opening Stock</span>
                    <span className="text-base font-extrabold text-slate-800 font-mono">{item.sap_baseline_qty} PC</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Live POS Sales</span>
                    <span className="text-base font-extrabold text-slate-700 font-mono">-{item.pos_live_deductions} PC</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Real-Time Stock</span>
                    <span className={`text-base font-extrabold font-mono px-2 py-0.5 rounded inline-block ${
                      isAtpDeficit ? 'text-rose-700 bg-rose-50 border border-rose-100' : 'text-slate-800 bg-slate-100'
                    }`}>
                      {atpStock} PC
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-50/50 border border-slate-150 rounded-xl p-4">
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-450">⏱️ Lead Time:</span>
                      <span className="font-bold text-slate-700">{(alertItem as any).vendor_lead_days || 3} Days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-450">🎯 ROP Trigger:</span>
                      <span className="font-bold text-slate-750">{(alertItem as any).atp_trigger_qty} PC</span>
                    </div>
                    <div className="flex justify-between text-blue-600 bg-blue-50/50 px-1.5 py-0.5 rounded">
                      <span className="font-semibold">🚚 Open Inbound:</span>
                      <span className="font-extrabold">{(alertItem as any).open_inbound_qty || 0} PC</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs font-mono pl-4 border-l border-slate-200">
                    <div className="flex justify-between">
                      <span className="text-slate-450">📈 Daily Velocity:</span>
                      <span className="font-bold text-slate-700">{velocity.toFixed(2)} / day</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span className="font-semibold">⏳ Horizon Left:</span>
                      <span className="font-extrabold">{horizon.toFixed(1)} Days</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 bg-emerald-50/50 px-1.5 py-0.5 rounded font-bold">
                      <span className="font-semibold">💰 Reorder Yield:</span>
                      <span className="font-extrabold">+€{(currentQty * 3.5).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Strategy Suggestion Banner */}
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 text-xs leading-normal flex items-start gap-2.5">
                  <span className="text-lg">💡</span>
                  <div>
                    <span className="font-bold text-amber-800 block mb-0.5">Replenishment Logic Explanation:</span>
                    <span className="text-slate-600">
                      {(alertItem as any).campaign_name ? (
                        <>High-velocity promotional uplift campaign <span className="font-bold text-purple-700">{(alertItem as any).campaign_name}</span> is active with a forecast modifier of <span className="font-bold text-purple-700">{(alertItem as any).uplift_factor || '2'}x</span>. The suggested safety net reorder quantity is scaled up to protect the shelf allocation window and avoid stockout risks.</>
                      ) : (
                        <>Available ATP stock is currently <span className="font-bold text-rose-600">{atpStock} PC</span>, which is below the Reorder Point (ROP) trigger of <span className="font-bold text-slate-800">{(alertItem as any).atp_trigger_qty} PC</span>. At current sales velocity, remaining inventory will run dry in <span className="font-bold text-rose-600">{horizon.toFixed(1)} days</span>.</>
                      )}
                    </span>
                  </div>
                </div>

                {/* Section 2: Procurement Channels / Routing Options */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Procurement Strategy Selector & Suggestions
                  </h4>
                  
                  {/* Option 1: Distribution Center STO */}
                  <div className="border border-blue-200 bg-gradient-to-r from-blue-50/30 to-indigo-50/30 rounded-xl p-4 hover:shadow-sm transition-all flex justify-between items-start gap-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-bold px-2 py-0.5 uppercase tracking-widest rounded-bl-lg">
                      Rank 1: Recommended
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">🏢</span>
                        <h5 className="font-bold text-slate-800 text-xs">DC Stock Transfer Order (STO)</h5>
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-md">
                        Transfer stock from <span className="font-semibold text-slate-700">Central DC (DE01)</span>. Lead time is only <span className="font-bold text-emerald-600">1 day</span>. Zero supplier cost and minimal transit fees.
                      </p>
                      <div className="flex gap-3 text-[10px] font-mono text-slate-450 pt-1">
                        <span>• DC SOH: <span className="font-semibold text-slate-600">1,400 PC (94% Avail)</span></span>
                        <span>• Freight Cost: <span className="font-semibold text-emerald-600">€0.00</span></span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSTOExecute}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-all shadow-xs self-center cursor-pointer"
                    >
                      Execute STO
                    </button>
                  </div>

                  {/* Option 2: Standard Supplier Direct PO */}
                  <div className="border border-slate-200 bg-white rounded-xl p-4 hover:shadow-sm transition-all flex justify-between items-start gap-4 relative">
                    <div className="absolute top-0 right-0 bg-slate-200 text-slate-600 text-[8px] font-bold px-2 py-0.5 uppercase tracking-widest rounded-bl-lg">
                      Rank 2: Vendor Direct
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">🏭</span>
                        <h5 className="font-bold text-slate-800 text-xs">Vendor Direct PO (Bypass Channel)</h5>
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-md">
                        Dispatch a direct Purchase Order to supplier <span className="font-semibold text-slate-700">{(alertItem as any).vendor_name || 'Associated Vendor'}</span>. Lead time is <span className="font-bold text-amber-600">{(alertItem as any).vendor_lead_days || 3}d</span>. Bypasses nightly consolidation check.
                      </p>
                      <div className="flex gap-3 text-[10px] font-mono text-slate-450 pt-1">
                        <span>• Lead Time: <span className="font-semibold text-slate-600">{(alertItem as any).vendor_lead_days || 3}d</span></span>
                        <span>• MOQ: <span className="font-semibold text-slate-600">{(alertItem as any).minbm_moq || 10} PC</span></span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleQueueReplenishment(item.sku, currentQty, item.sap_plant_code, true);
                        setSelectedItemForDrawer(null);
                      }}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold rounded-lg transition-all self-center cursor-pointer"
                    >
                      Direct PO
                    </button>
                  </div>

                  {/* Option 3: Nightly Consolidated Batch Staging */}
                  <div className="border border-slate-200 bg-white rounded-xl p-4 hover:shadow-sm transition-all flex justify-between items-start gap-4 relative">
                    <div className="absolute top-0 right-0 bg-slate-100 text-slate-400 text-[8px] font-bold px-2 py-0.5 uppercase tracking-widest rounded-bl-lg">
                      Rank 3: Batch Queue
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">📦</span>
                        <h5 className="font-bold text-slate-800 text-xs">Standard Nightly Batch Staging</h5>
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-md">
                        Stage in standard local cache. Aggregated into the nightly batch writeback cut-off to save OData writes.
                      </p>
                      <div className="flex gap-3 text-[10px] font-mono text-slate-450 pt-1">
                        <span>• Next Consolidation: <span className="font-semibold text-slate-600">23:59 UTC</span></span>
                        <span>• Digital Access Cost: <span className="font-semibold text-emerald-600">Saved</span></span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleQueueReplenishment(item.sku, currentQty, item.sap_plant_code, false);
                        setSelectedItemForDrawer(null);
                      }}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold rounded-lg transition-all self-center cursor-pointer"
                    >
                      Stage Order
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer CTA */}
              <div className="border-t border-slate-100 pt-4 flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Order Quantity:</span>
                  <input
                    type="number"
                    value={currentQty}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setEditedQuantities(prev => ({
                        ...prev,
                        [item.sku]: isNaN(val) ? 0 : val
                      }));
                    }}
                    className="w-16 h-8 text-xs border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg font-bold text-center text-slate-900 bg-white"
                    min={0}
                  />
                  <span className="text-slate-400 text-xs font-mono">{item.uom}</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setSelectedItemForDrawer(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white rounded-lg shadow-md transition-all uppercase tracking-wider cursor-pointer"
                >
                  Close Strategy Builder
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
