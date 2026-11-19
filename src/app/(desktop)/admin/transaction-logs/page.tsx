'use client';

// /src/app/(desktop)/admin/transaction-logs/page.tsx
// SmartStock — Success & Error logs, transaction- and module-wise.

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, RoleGuard } from '@/components/domain/RoleGuard';
import { ActivityLogView } from '@/components/domain/ActivityLogView';
import { useI18n } from '@/lib/i18n';

export default function TransactionLogsPage() {
  const { t } = useI18n();
  return (
    <RoleGuard module="translogs">
      <div className="space-y-5">
        <PageHeader
          title={t('Transaction Logs')}
          subtitle="Success, warning and error outcomes for every transaction (POS ingestion, SAP postings, bin movements, counts, approvals) grouped by module, with references, durations and error messages."
          badge={<Badge status="info" size="sm">Module-wise</Badge>}
          actions={
            <div className="flex gap-2 text-xs font-semibold">
              <Link href="/admin/dead-letter" className="px-3 py-2 rounded-lg border border-[#D0D5DD] text-[#344054] hover:bg-[#F9FAFB]">Dead-letter queue →</Link>
              <Link href="/admin/quarantine" className="px-3 py-2 rounded-lg border border-[#D0D5DD] text-[#344054] hover:bg-[#F9FAFB]">Quarantine →</Link>
            </div>
          }
        />
        <ActivityLogView mode="transactions" />
      </div>
    </RoleGuard>
  );
}
