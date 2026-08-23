'use client';

// /src/app/(desktop)/admin/quarantine/page.tsx
// SmartStock Experience V1 — Identity Quarantine & Safe Replay Console

import React, { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';

interface QuarantineItem {
  id: string;
  quarantineType: 'PRODUCT_MAPPING_REQUIRED' | 'LOCATION_MAPPING_REQUIRED' | 'UOM_MAPPING_REQUIRED';
  externalId: string;
  sourceSystem: string;
  occurrenceCount: number;
  suggestedTarget: string;
  status: 'PENDING' | 'RESOLVED';
  lastSeen: string;
}

export default function QuarantinePage() {
  const { toast } = useToast();
  const [isReplaying, setIsReplaying] = useState<string | null>(null);

  const sampleQuarantined: QuarantineItem[] = [
    {
      id: 'q-01',
      quarantineType: 'PRODUCT_MAPPING_REQUIRED',
      externalId: 'SHP_VAR_992141',
      sourceSystem: 'SHOPIFY',
      occurrenceCount: 14,
      suggestedTarget: 'AP-PRO-USB-C',
      status: 'PENDING',
      lastSeen: '12 min ago',
    },
    {
      id: 'q-02',
      quarantineType: 'LOCATION_MAPPING_REQUIRED',
      externalId: 'STORE_CODE_UTR_EAST',
      sourceSystem: 'SQUARE',
      occurrenceCount: 6,
      suggestedTarget: 'Store 1004 (Utrecht Station)',
      status: 'PENDING',
      lastSeen: '45 min ago',
    },
    {
      id: 'q-03',
      quarantineType: 'UOM_MAPPING_REQUIRED',
      externalId: 'PK12',
      sourceSystem: 'NCR_SFTP',
      occurrenceCount: 2,
      suggestedTarget: '12 CS (Pack 12)',
      status: 'PENDING',
      lastSeen: '1h ago',
    },
  ];

  const handleMapAndReplay = (id: string, extId: string) => {
    setIsReplaying(id);
    setTimeout(() => {
      setIsReplaying(null);
      toast({
        type: 'success',
        title: 'Identity Mapped & Transactions Replayed',
        description: `All quarantined transactions for ${extId} have been reprocessed and emitted to digital twin.`,
      });
    }, 700);
  };

  const columns: Column<QuarantineItem>[] = [
    {
      key: 'quarantineType',
      header: 'Quarantine Reason',
      render: (r) => (
        <Badge status="warning" size="sm">
          {r.quarantineType.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'externalId',
      header: 'Unresolved Source ID',
      render: (r) => <span className="font-mono font-semibold text-xs text-[#101828]">{r.externalId}</span>,
    },
    {
      key: 'sourceSystem',
      header: 'Source POS',
      render: (r) => <span className="text-xs text-[#475467] font-medium">{r.sourceSystem}</span>,
    },
    {
      key: 'occurrenceCount',
      header: 'Held Events',
      align: 'right',
      render: (r) => <span className="font-mono text-xs text-[#101828] font-bold">{r.occurrenceCount}</span>,
    },
    {
      key: 'suggestedTarget',
      header: 'Suggested SmartStock Target',
      render: (r) => (
        <span className="text-xs font-mono text-[#14706B] bg-[#E8F4F3] px-2 py-0.5 rounded border border-[#14706B]/20">
          {r.suggestedTarget}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) => (
        <Button
          variant="primary"
          size="sm"
          isLoading={isReplaying === r.id}
          onClick={() => handleMapAndReplay(r.id, r.externalId)}
        >
          Map & Replay
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#E4E7EC] pb-4">
        <h1 className="text-xl font-semibold text-[#101828] tracking-tight">
          Unresolved Identity Quarantine Store
        </h1>
        <p className="text-xs text-[#475467] mt-0.5">
          Holds transactions with unmapped SKUs, locations, or UOMs safely to prevent inventory corruption.
        </p>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sampleQuarantined}
        keyExtractor={(r) => r.id}
        density="comfortable"
      />
    </div>
  );
}
