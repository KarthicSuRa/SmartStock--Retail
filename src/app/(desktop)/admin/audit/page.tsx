'use client';

// /src/app/(desktop)/admin/audit/page.tsx
// SmartStock — Audit Log: who did which transaction, in which module, when, and with what outcome.

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, RoleGuard } from '@/components/domain/RoleGuard';
import { ActivityLogView } from '@/components/domain/ActivityLogView';
import { useI18n } from '@/lib/i18n';

export default function AuditTrailPage() {
  const { t } = useI18n();
  return (
    <RoleGuard module="audit">
      <div className="space-y-5">
        <PageHeader
          title={t('Audit Logs')}
          subtitle="Every user action — logins, bin movements, approvals, role & permission changes, master-data edits, exports — with who, what, when and outcome. Append-only."
          badge={
            <>
              <Badge status="healthy" size="sm">Append-only</Badge>
              <span className="text-xs font-mono text-[#667085]">SOC2 & GDPR Art. 30</span>
            </>
          }
        />
        <ActivityLogView mode="audit" />
      </div>
    </RoleGuard>
  );
}
