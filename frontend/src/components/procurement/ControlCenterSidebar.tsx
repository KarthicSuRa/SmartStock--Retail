import RoiAuditModule from './RoiAuditModule';
import type { ReplenishmentAlert } from '../../hooks/useLiveInventory';

export interface ControlCenterSidebarProps {
  stagedRequisitions: any[];
  alerts: ReplenishmentAlert[];
  isTransmitting: boolean;
  handleRunODataOptimizerAndTransmit: () => Promise<void> | void;
}

export default function ControlCenterSidebar({
  stagedRequisitions,
  alerts,
  isTransmitting,
  handleRunODataOptimizerAndTransmit,
}: ControlCenterSidebarProps) {
  const getVendorDetails = (sku: string) => {
    const alertItem = alerts.find(i => i.sku === sku);
    if (alertItem) {
      return {
        vendor_name: alertItem.vendor_name || 'Unknown Vendor',
        vendor_id: alertItem.vendor_id || 'Unknown LIFNR',
        netpr_price: Number(alertItem.netpr_price) || 0.0,
        sales_margin: Number(alertItem.sales_margin) || 5.0
      };
    }
    return {
      vendor_name: 'Simulated Vendor',
      vendor_id: 'V-MOCK',
      netpr_price: 1.5,
      sales_margin: 5.0
    };
  };

  const activeStagedItems = stagedRequisitions.filter(r => r.status === 'STAGED' || r.status === 'APPROVED');
  
  const totalBatchYield = activeStagedItems.reduce((sum, item) => {
    const details = getVendorDetails(item.sku);
    return sum + (item.quantity * details.sales_margin);
  }, 0).toFixed(2);

  const groupedStaged = activeStagedItems.reduce((acc, item) => {
    const details = getVendorDetails(item.sku);
    const vendorName = details.vendor_name;
    if (!acc[vendorName]) {
      acc[vendorName] = [];
    }
    acc[vendorName].push({ ...item, ...details });
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="flex-grow flex flex-col h-full overflow-hidden">
      {/* Executive Economic Capsule */}
      <div className="bg-slate-950 border border-slate-800 text-amber-400 font-mono text-xs p-4 rounded-xl mb-4 text-center tracking-tight shadow-md">
        ✨ TOTAL BATCH FINANCIAL YIELD: +€{totalBatchYield} (Protected Revenue)
      </div>

      {/* Executive ROI Tracking Module */}
      <RoiAuditModule stagedItems={activeStagedItems} />

      {/* Grouped Vendor Summaries */}
      <div className="flex-grow overflow-y-auto pr-1">
        {activeStagedItems.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-8">
            No active staged PR items. Click "Generate Internal Purchase Requisition" on radar cards to stage items.
          </p>
        ) : (
          Object.entries(groupedStaged).map(([vendorName, items]: [string, any]) => (
            <div key={`grouped-vendor-${vendorName}`} className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-3 text-slate-200 text-xs font-mono space-y-1.5">
              <div className="border-b border-slate-800 pb-1 font-bold text-blue-400 mb-1">
                🏢 {vendorName}
              </div>
              {items.map((item: any) => (
                <div key={`staged-item-${item.id}`}>
                  • SKU: {item.sku} | Qty: {item.suggested_quantity || item.quantity} PC
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Action Executer Button */}
      <button
        type="button"
        onClick={handleRunODataOptimizerAndTransmit}
        disabled={isTransmitting || activeStagedItems.length === 0}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs uppercase tracking-wider p-4 rounded-xl transition-all shadow-lg text-center cursor-pointer mt-4"
      >
        {isTransmitting ? '⚙️ Optimizing & Transmitting Batch (Idempotency Secured)...' : '🚀 Run OData Optimizer & Transmit Batch'}
      </button>
    </div>
  );
}
