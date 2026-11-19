'use client';

// /src/components/domain/RoleGuard.tsx
// Enforces the role → module authorization matrix (src/lib/roles.ts) on a page.

import React from 'react';
import Link from 'next/link';
import { Lock, Eye } from 'lucide-react';
import { AccessLevel, meets, roleLabel, useAuthorization } from '@/lib/roles';
import { useI18n } from '@/lib/i18n';

export function RoleGuard({ module, require = 'view', children }: { module: string; require?: AccessLevel; children: React.ReactNode }) {
  const { level, role } = useAuthorization(module);
  const { t } = useI18n();

  if (!meets(level, require)) {
    return (
      <div className="op-card bg-white p-10 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#FEF3F2] text-[#B42318] flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5" />
        </div>
        <h2 className="text-base font-bold text-[#101828]">{t('Access restricted')}</h2>
        <p className="text-xs text-[#475467]">
          {t('Your role does not have access to this module.')} <br />
          <span className="font-mono">
            {roleLabel(role)} · {module} · {level}
          </span>
        </p>
        <Link href="/admin/roles" className="inline-block text-xs font-semibold text-[#14706B] hover:underline">
          View authorization matrix →
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

/** Small banner shown when the user can view but not edit. */
export function ReadOnlyBanner({ module }: { module: string }) {
  const { canEdit } = useAuthorization(module);
  const { t } = useI18n();
  if (canEdit) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#EFF8FF] border border-[#B2DDFF] text-[#175CD3] text-xs font-medium">
      <Eye className="w-3.5 h-3.5" /> {t('Read-only access')}
    </div>
  );
}

/** Standard page header used across new modules. */
export function PageHeader({ title, subtitle, badge, actions }: { title: string; subtitle: string; badge?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="op-card p-5 sm:p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-[#14706B]">
      <div className="min-w-0">
        {badge && <div className="flex items-center gap-2 mb-1">{badge}</div>}
        <h1 className="text-xl font-bold text-[#101828] tracking-tight">{title}</h1>
        <p className="text-xs text-[#475467] mt-0.5">{subtitle}</p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
