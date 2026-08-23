'use client';

// /src/components/domain/NetworkPositionMatrix.tsx
// SmartStock Experience RC1 — Cross-Store Network Availability Matrix

import React from 'react';
import { Badge } from '../ui/Badge';

export interface StoreInventoryNode {
  storeId: string;
  storeName: string;
  sellable: number;
  dos: number; // Days of supply
  status: 'critical' | 'low' | 'healthy' | 'surplus';
  isSurplusSource?: boolean;
}

export interface NetworkPositionMatrixProps {
  sku: string;
  productName: string;
  nodes?: StoreInventoryNode[];
  className?: string;
}

export const NetworkPositionMatrix: React.FC<NetworkPositionMatrixProps> = ({
  sku,
  productName,
  nodes = [
    { storeId: '1001', storeName: 'Amsterdam Central', sellable: 4, dos: 0.6, status: 'critical' },
    { storeId: '1002', storeName: 'Amsterdam Zuid', sellable: 36, dos: 3.8, status: 'surplus', isSurplusSource: true },
    { storeId: '1003', storeName: 'Rotterdam Centraal', sellable: 18, dos: 2.1, status: 'healthy' },
    { storeId: '1004', storeName: 'Utrecht Station', sellable: 7, dos: 0.9, status: 'low' },
    { storeId: 'DC-01', storeName: 'Moerdijk Central DC', sellable: 281, dos: 14.5, status: 'healthy' },
  ],
  className = '',
}) => {
  return (
    <div className={`op-card p-4 bg-white border border-[#E4E7EC] rounded-[8px] space-y-3 ${className}`}>
      <div className="flex items-center justify-between border-b border-[#EAECF0] pb-2">
        <div>
          <h4 className="text-xs font-semibold text-[#101828]">Cross-Store Network Availability</h4>
          <p className="text-[11px] text-[#667085]">{productName} ({sku})</p>
        </div>
        <span className="text-[10px] font-mono text-[#667085]">5 Nodes Monitored</span>
      </div>

      <div className="divide-y divide-[#F2F4F7] text-xs">
        {nodes.map((node) => (
          <div key={node.storeId} className="py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[#101828]">{node.storeName}</span>
              {node.isSurplusSource && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-[#E8F4F3] text-[#14706B] border border-[#14706B]/20">
                  Surplus Source
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 font-mono">
              <span className="text-[#667085]">{node.dos} DOS</span>
              <strong className="text-[#101828] text-sm w-16 text-right">{node.sellable} Units</strong>
              <div className="w-20 text-right">
                <Badge
                  status={
                    node.status === 'critical'
                      ? 'critical'
                      : node.status === 'low'
                      ? 'degraded'
                      : 'healthy'
                  }
                  size="sm"
                >
                  {node.status.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
