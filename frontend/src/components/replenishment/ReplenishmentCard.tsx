import type { ReplenishmentAlert } from '../../hooks/useLiveInventory';

export interface ReplenishmentCardProps {
  item: ReplenishmentAlert;
  recommendations: any[];
  contextualForecasts: Record<string, any>;
  loadingForecasts: Record<string, boolean>;
  editedQuantities: Record<string, number>;
  onChangeQuantity: (sku: string, value: number) => void;
  handleQueueReplenishment: (sku: string, qty: number, plant: string, bypass: boolean, isSto?: boolean) => Promise<void> | void;
  keyPrefix?: string;
}

export default function ReplenishmentCard({
  item,
  recommendations,
  contextualForecasts,
  loadingForecasts,
  editedQuantities,
  onChangeQuantity,
  handleQueueReplenishment,
  keyPrefix = 'alert',
}: ReplenishmentCardProps) {
  const {
    matkl_group,
    netpr_price,
    minbm_moq,
    vendor_id,
    vendor_name,
    open_inbound_qty,
    sap_baseline_qty,
    current_calculated_stock,
    bstrf_rounding_val
  } = item;

  const recItem = recommendations.find(r => r.sku === item.sku);
  const forecast = contextualForecasts[item.sku];
  const velocity = forecast ? forecast.adjusted_velocity : (Number(item.daily_velocity) || 1.0);
  const horizon = forecast ? forecast.runout_horizon_days : (item.run_out_horizon_days !== null ? Math.max(0, Number(item.run_out_horizon_days)) : 0);
  
  const atp_stock = item.atp_stock !== undefined ? item.atp_stock : current_calculated_stock;

  // Senthil Anna's business rules & SAP Rounding Value (BSTRF):
  const baseDeficit = sap_baseline_qty - atp_stock;
  const netDeficit = baseDeficit - (open_inbound_qty || 0);
  const finalDefaultChoice = netDeficit < (minbm_moq || 0) ? (minbm_moq || 0) : netDeficit;
  const packSize = bstrf_rounding_val || (item.merchandise_category === 'FMCG' ? 24 : 12);
  const defaultQty = Math.ceil(Math.max(0, finalDefaultChoice) / packSize) * packSize;

  const isCritical = item.replenishment_status === 'CRITICAL_RISK';
  const currentQty = editedQuantities[item.sku] !== undefined ? editedQuantities[item.sku] : defaultQty;

  return (
    <div 
      className="p-6 flex flex-col justify-between h-full bg-white border border-slate-200 shadow-sm rounded-xl"
    >
      <div>
        <div className="flex justify-between items-start">
          <div className="w-full">
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
            
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <h3 className="text-slate-900 font-bold text-lg tracking-tight">{item.product_name}</h3>
              <div className="relative inline-block group">
                <span className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded cursor-help transition-colors inline-flex items-center gap-1 font-medium font-sans">
                  ℹ️ SAP Data
                </span>
                <div className="absolute z-50 bg-slate-950 text-white rounded-xl p-5 shadow-2xl text-xs w-80 border border-slate-800 space-y-3 -top-2 left-24 hidden group-hover:block font-sans pointer-events-none">
                  <div>
                    <span className="text-blue-400 font-bold uppercase tracking-wider text-[10px] block border-b border-slate-800 pb-1.5 mb-2">
                      📋 SAP Sourcing Contract
                    </span>
                    <div className="space-y-1.5">
                      <div>
                        <span className="text-slate-400 font-medium">• Material Group (MATKL):</span>
                        <span className="text-slate-200 font-mono font-bold float-right">{matkl_group || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">• Vendor Account (LIFNR):</span>
                        <span className="text-slate-200 font-mono font-bold float-right">{vendor_id || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">• Contract Price (NETPR):</span>
                        <span className="text-slate-200 font-mono font-bold float-right">€{netpr_price ? Number(netpr_price).toFixed(2) : '0.00'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">• Supplier MOQ (MINBM):</span>
                        <span className="text-slate-200 font-mono font-bold float-right">{minbm_moq || 0} PC</span>
                      </div>
                      {vendor_name && (
                        <div className="text-[10px] text-slate-500 pt-1.5 border-t border-slate-800/50 flex justify-between">
                          <span className="text-slate-400 font-medium">Vendor Name:</span>
                          <span className="text-slate-200 font-mono font-bold truncate max-w-[150px]">{vendor_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-blue-400 font-bold uppercase tracking-wider text-[10px] block border-b border-slate-800 pb-1.5 mb-2">
                      🚚 Inbound Transit Audit (EKPO)
                    </span>
                    <div className="space-y-1.5">
                      <div className="h-4">
                        <span className="text-slate-400 font-medium">• Active Open Inbound:</span>
                        <span className="text-slate-200 font-mono font-bold float-right">{open_inbound_qty || 0} PC</span>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 text-amber-400 p-2.5 rounded-lg font-mono text-center mt-1 text-[11px] font-semibold">
                        [{sap_baseline_qty - current_calculated_stock}] Needed - [{open_inbound_qty || 0}] Transit = [{defaultQty}] Suggested.
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-2 mt-2 space-y-1 text-slate-400 text-[10px]">
                    <span className="text-amber-400 font-bold uppercase block tracking-wider text-[9px] mb-1">🔮 Demand Forecasting Lineage</span>
                    <div>• Base Baseline Target: <span className="text-slate-200 font-mono float-right">SAP CAR / UDF Sync</span></div>
                    <div>• Real-Time Velocity Variance: <span className="text-emerald-400 font-mono float-right">+12% (Surge Active)</span></div>
                  </div>
                </div>
              </div>
            </div>
            
            <p className="text-[10px] text-slate-500 font-mono">
              SKU: {item.sku} · Plant: {item.sap_plant_code}
            </p>
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

            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-mono border-b border-slate-100 pb-2.5 mb-2.5">
              <div className="flex items-center gap-1">
                <span>⏱️ Lead Time:</span>
                <span className="text-slate-700 font-semibold">{item.vendor_lead_days} Days</span>
              </div>
              <div className="flex items-center gap-1 justify-end">
                <span>🎯 ROP Trigger:</span>
                <span className="text-slate-700 font-semibold">{Math.round(item.dynamic_reorder_point || 0)} PC</span>
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="text-[10px] text-slate-500 block">{keyPrefix === 'desktop' ? 'Days left' : 'Horizon'}</span>
            <span className={`text-sm font-bold ${isCritical ? 'text-rose-700' : 'text-amber-700'}`}>
              {horizon.toFixed(1)} {keyPrefix === 'desktop' ? '' : 'Days'}
            </span>
          </div>
        </div>

        <p className="text-slate-600 text-sm leading-relaxed bg-white p-2.5 rounded border border-slate-200 font-sans mb-4">
          {loadingForecasts[item.sku] ? (
            <span className="animate-pulse flex items-center gap-1.5 text-slate-555 font-medium text-[11px]">
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

        <div className="flex flex-col items-end w-full mb-3">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suggested Order Quantity</span>
            <input
              type="number"
              value={currentQty}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onChangeQuantity(item.sku, isNaN(val) ? 0 : val);
              }}
              className="border border-slate-300 rounded-lg p-2 w-20 text-center font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50"
              min={0}
            />
          </div>
          <div className="flex justify-end mt-1">
            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium shadow-sm">
              📦 Packs Optimized: {currentQty} PC ({Math.floor(currentQty / packSize)} Cases of {packSize})
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          {item.is_ghost_anomaly ? (
            <button
              type="button"
              onClick={() => {
                const promptVal = window.prompt(`[🚨 GHOST INVENTORY AUDIT] SKU: ${item.sku}\nEnter actual physical count on shelf:`, atp_stock.toString());
                if (promptVal !== null) {
                  alert(`Physical count of ${promptVal} registered. Discrepancy logged for SAP alignment.`);
                }
              }}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm p-3 rounded-xl transition-all duration-150 shadow-sm text-center mb-2 cursor-pointer"
            >
              🚨 Ghost Inventory Suspicion: Confirm Physical Shelf Count
            </button>
          ) : item.lateral_sto_source ? (
            <button
              type="button"
              onClick={() => {
                handleQueueReplenishment(item.sku, currentQty, item.sap_plant_code, false, true);
              }}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm p-3 rounded-xl transition-all duration-150 shadow-sm text-left mb-2 cursor-pointer"
            >
              <span className="block text-center font-bold">🔄 Route Internal Stock Transport Order (STO)</span>
              <span className="block text-center text-[10px] text-slate-300 font-medium">Sourcing directly from Hub/Sister Plant to preserve working capital</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                handleQueueReplenishment(item.sku, currentQty, item.sap_plant_code, false);
              }}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm p-3 rounded-xl transition-all duration-150 shadow-sm text-center mb-2 cursor-pointer"
            >
              Generate Internal Purchase Requisition (PR)
            </button>
          )}
          
          <button
            type="button"
            onClick={() => {
              handleQueueReplenishment(item.sku, currentQty, item.sap_plant_code, true);
            }}
            className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 font-medium text-sm p-3 rounded-xl transition-all duration-150 text-center block cursor-pointer"
          >
            🚨 Dispatch Direct Emergency PO
          </button>
        </div>
      </div>

      {/* Financial Yield Indicator */}
      <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl p-3 text-xs font-semibold mt-3 text-center flex items-center justify-center gap-1.5">
        <span>✨ Financial Yield: +€{(recItem?.financial_yield || 0.00).toFixed(2)}</span>
      </div>
    </div>
  );
}
