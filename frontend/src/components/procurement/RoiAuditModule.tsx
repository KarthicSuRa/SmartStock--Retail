export interface RoiAuditModuleProps {
  stagedItems: any[];
}

export default function RoiAuditModule({ stagedItems }: RoiAuditModuleProps) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-[11px] text-slate-400 mb-4">
      <div className="text-blue-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800 pb-1 mb-1">
        🛡️ ERP Compliance & License Audit
      </div>
      <div className="flex justify-between">
        <span>SAP Named FUE Seats Saved:</span>
        <span className="text-emerald-400 font-bold">50 Users (~€2,500/mo)</span>
      </div>
      <div className="flex justify-between">
        <span>OData API Traffic Consolidation:</span>
        <span className="text-blue-400 font-bold">{stagedItems.length} Lines → 1 $batch</span>
      </div>
      <div className="text-[10px] text-slate-550 italic mt-1">
        *Insulating core runtime from indirect digital access compliance fees.
      </div>
    </div>
  );
}
