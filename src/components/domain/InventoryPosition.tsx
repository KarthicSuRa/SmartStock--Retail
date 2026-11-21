'use client';

// /src/components/domain/InventoryPosition.tsx
// SmartStock Experience V2 — Operational Stock Position Matrix with true UOM and visible variance

export interface InventoryPositionProps {
  sellable: number;
  onHand: number;
  reserved: number;
  inTransit: number;
  sapRecorded: number;
  uom?: string;
  className?: string;
}

export const InventoryPosition: React.FC<InventoryPositionProps> = ({
  sellable,
  onHand,
  reserved,
  inTransit,
  sapRecorded,
  uom,
  className = '',
}) => {
  const sellableIsVariance = sellable !== sapRecorded;
  const onHandIsVariance = onHand !== sapRecorded;

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#F9FAFB] p-3 rounded-[6px] border border-[#EAECF0] text-center font-mono ${className}`}>
      <div className="space-y-0.5">
        <span className="text-[10px] uppercase text-[#667085] font-sans font-medium block">Sellable</span>
        <span className="text-sm font-semibold text-[#101828]">
          {sellable} <span className="text-[10px] text-[#667085] font-normal">{uom || '-'}</span>
        </span>
        {sellableIsVariance && (
          <span className="text-[10px] text-[#B42318] font-medium block">
            ⚠ Variance from SAP
          </span>
        )}
      </div>

      <div className="space-y-0.5">
        <span className="text-[10px] uppercase text-[#667085] font-sans font-medium block">On Hand</span>
        <span className="text-sm font-medium text-[#344054]">
          {onHand} <span className="text-[10px] text-[#667085] font-normal">{uom || '-'}</span>
        </span>
        {onHandIsVariance && (
          <span className="text-[10px] text-[#B42318] font-medium block">
            ⚠ Variance from SAP
          </span>
        )}
      </div>

      <div className="space-y-0.5">
        <span className="text-[10px] uppercase text-[#667085] font-sans font-medium block">In Transit</span>
        <span className="text-sm font-medium text-[#1570EF]">
          +{inTransit} <span className="text-[10px] text-[#667085] font-normal">{uom || '-'}</span>
        </span>
      </div>

      <div className="space-y-0.5">
        <span className="text-[10px] uppercase text-[#667085] font-sans font-medium block">SAP Recorded</span>
        <span className={`text-sm font-semibold ${sellableIsVariance || onHandIsVariance ? 'text-[#DC6803]' : 'text-[#344054]'}`}>
          {sapRecorded} <span className="text-[10px] text-[#667085] font-normal">{uom || '-'}</span>
        </span>
      </div>
    </div>
  );
};