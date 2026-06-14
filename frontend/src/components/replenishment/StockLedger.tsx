import { useState, useMemo } from 'react';
import type { LiveInventoryItem, ReplenishmentAlert } from '../../hooks/useLiveInventory';

interface StockLedgerProps {
  inventory: LiveInventoryItem[];
  alerts: ReplenishmentAlert[];
}

export default function StockLedger({ inventory, alerts }: StockLedgerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlant, setSelectedPlant] = useState('ALL');

  // Plants dropdown metadata
  const plants = [
    { id: '1001', name: '1001 - Rotterdam Centraal Outlet' },
    { id: '1002', name: '1002 - Amsterdam Flagship Store' },
    { id: '7001', name: '7001 - Moerdijk Central Logistics Hub' }
  ];

  // Helper to find netpr_price from alerts by sku/plant, fallback to mock/fixed price based on SKU hash
  const getUnitPrice = (sku: string, plantCode: string): number => {
    const matchedAlert = alerts.find(a => a.sku === sku && a.sap_plant_code === plantCode);
    if (matchedAlert && matchedAlert.netpr_price !== undefined && matchedAlert.netpr_price !== null) {
      return matchedAlert.netpr_price;
    }
    // Consistent fallback based on SKU numeric string
    const num = parseInt(sku.replace(/\D/g, ''), 10) || 1234;
    return (num % 80) + 15.99; // €15.99 - €95.99
  };

  // Filter logic
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = 
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product_name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesPlant = selectedPlant === 'ALL' || item.sap_plant_code === selectedPlant;

      return matchesSearch && matchesPlant;
    });
  }, [inventory, searchQuery, selectedPlant]);

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-4">
      {/* Header controls section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <span>📊 Real-time Master Stock Ledger</span>
            <span className="bg-blue-50 text-blue-700 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-blue-100">
              SAP MB52
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Unified inventory ledger with ERP reservations and valuation trackers.</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative w-48 sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SKU or description..."
              className="bg-slate-50 border border-slate-200 text-slate-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-8 pr-7 py-1.5 shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Plant Dropdown */}
          <select
            value={selectedPlant}
            onChange={(e) => setSelectedPlant(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg focus:ring-blue-500 focus:border-blue-500 block px-2.5 py-1.5"
          >
            <option value="ALL">All Plants</option>
            {plants.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-slate-700">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 text-left">SKU / Material Code</th>
              <th className="py-3 px-4 text-left">Description</th>
              <th className="py-3 px-4 text-center">Plant (WERKS)</th>
              <th className="py-3 px-4 text-right">Physical Stock (SOH)</th>
              <th className="py-3 px-4 text-right">Allocated Reservations</th>
              <th className="py-3 px-4 text-right">Net Available (ATP)</th>
              <th className="py-3 px-4 text-right">Unit Price</th>
              <th className="py-3 px-4 text-right">Total Valuation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredInventory.map((item, index) => {
              const atp = item.current_calculated_stock - item.pos_live_deductions;
              const unitPrice = getUnitPrice(item.sku, item.sap_plant_code);
              const totalValuation = item.current_calculated_stock * unitPrice;
              const isNegativeAtp = atp < 0;

              return (
                <tr 
                  key={`${item.sku}-${item.sap_plant_code}`} 
                  className={`hover:bg-slate-50/80 transition-colors ${index % 2 === 1 ? 'bg-slate-50/30' : ''}`}
                >
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{item.sku}</td>
                  <td className="py-3.5 px-4 font-medium text-slate-800">{item.product_name}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono">
                      {item.sap_plant_code}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-medium">{item.current_calculated_stock} {item.uom}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-500">{item.pos_live_deductions} {item.uom}</td>
                  <td className={`py-3.5 px-4 text-right font-mono font-bold ${isNegativeAtp ? 'text-rose-600' : 'text-slate-800'}`}>
                    {isNegativeAtp ? (
                      <span className="bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded text-rose-700 font-bold">
                        {atp} {item.uom}
                      </span>
                    ) : (
                      <span>{atp} {item.uom}</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-600">€{unitPrice.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800">€{totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
            
            {filteredInventory.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400 font-medium">
                  No stock items match the active search criteria or plant filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
