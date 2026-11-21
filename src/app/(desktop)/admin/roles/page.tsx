'use client';

// /src/app/(desktop)/admin/roles/page.tsx
// SmartStock — Roles, authorization matrix (role × module × access level) and user role assignment.

import React from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ExportMenu } from '@/components/ui/ExportMenu';
import { PageHeader, ReadOnlyBanner, RoleGuard } from '@/components/domain/RoleGuard';
import { useToast } from '@/hooks/useToast';
import { AccessLevel, ACCESS_ORDER, DEFAULT_MATRIX, levelFor, matrixStore, MODULES, ROLES, roleLabel, useAuthorization } from '@/lib/roles';
import { createPersistentStore } from '@/lib/local-store';
import { logActivity } from '@/lib/activity-log';
import { EMPLOYEES, STORES } from '@/lib/master-data';
import { useI18n } from '@/lib/i18n';

const LEVEL_STYLE: Record<AccessLevel, string> = {
  none: 'bg-[#F2F4F7] text-[#98A2B3]',
  view: 'bg-[#EFF8FF] text-[#175CD3]',
  edit: 'bg-[#FEF6EE] text-[#B54708]',
  approve: 'bg-[#EDFDF5] text-[#027A48]',
};
const LEVEL_SYMBOL: Record<AccessLevel, string> = { none: '—', view: 'V', edit: 'E', approve: 'A' };

interface Assignment { id: string; name: string; role: string; store: string }
const assignmentStore = createPersistentStore<Assignment[]>('ss.user-roles.v1', () => [
  ...EMPLOYEES.map((e) => ({ id: e.id, name: e.name, role: e.role, store: e.store })),
  { id: 'E-900', name: 'Karthic B', role: 'system_admin', store: 'ALL' },
  { id: 'E-901', name: 'Elena Rostova', role: 'supply_chain', store: 'ALL' },
  { id: 'E-902', name: 'Marco Bianchi', role: 'buyer', store: 'ALL' },
  { id: 'E-903', name: 'Hannah Vos', role: 'auditor', store: 'ALL' },
]);

export default function RolesPage() {
  return (
    <RoleGuard module="users">
      <RolesInner />
    </RoleGuard>
  );
}

function RolesInner() {
  const [matrix, setMatrix] = matrixStore.useStore();
  const [assignments, setAssignments] = assignmentStore.useStore();
  const { canEdit } = useAuthorization('users');
  const { toast } = useToast();
  const { t } = useI18n();

  const cycle = (role: string, module: string) => {
    if (!canEdit) return;
    if (role === 'system_admin' && module === 'users') {
      toast({ type: 'warning', title: 'Protected permission', description: 'System Admin must keep access to Users & Roles (prevents lock-out).' });
      logActivity({ module: 'users', action: 'Permission change', entity: 'system_admin · users', status: 'error', message: 'Blocked: lock-out protection' });
      return;
    }
    const cur = levelFor(matrix, role, module);
    const next = ACCESS_ORDER[(ACCESS_ORDER.indexOf(cur) + 1) % ACCESS_ORDER.length];
    setMatrix((m) => ({ ...m, [role]: { ...m[role], [module]: next } }));
    logActivity({ module: 'users', action: 'Permission changed', entity: `${roleLabel(role)} · ${MODULES.find((x) => x.key === module)?.label}: ${cur} → ${next}`, status: 'success' });
  };

  const resetMatrix = () => {
    setMatrix(DEFAULT_MATRIX);
    logActivity({ module: 'users', action: 'Authorization matrix reset to defaults', entity: 'All roles', status: 'success' });
    toast({ type: 'info', title: 'Matrix reset to defaults' });
  };

  const changeRole = (id: string, role: string) => {
    const a = assignments.find((x) => x.id === id);
    if (!a) return;
    setAssignments((prev) => prev.map((x) => (x.id === id ? { ...x, role } : x)));
    logActivity({ module: 'users', action: 'Role changed', entity: `${a.name}: ${roleLabel(a.role)} → ${roleLabel(role)}`, status: 'success' });
    toast({ type: 'success', title: 'Role updated', description: `${a.name} is now ${roleLabel(role)}` });
  };

  const changeStore = (id: string, store: string) => {
    const a = assignments.find((x) => x.id === id);
    if (!a) return;
    setAssignments((prev) => prev.map((x) => (x.id === id ? { ...x, store } : x)));
    logActivity({ module: 'users', action: 'Store scope changed', entity: `${a.name}: ${a.store} → ${store}`, status: 'success' });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Roles & Access')}
        subtitle="Define what each role can see and do per module. Restrictions are enforced on every screen; every change is written to the audit log."
        badge={<Badge status="healthy" size="sm">RBAC · Separation of Duties</Badge>}
        actions={
          <ExportMenu
            title="Authorization Matrix"
            module="users"
            landscape
            rows={ROLES}
            columns={[{ header: 'Role', value: (r) => r.label }, { header: 'Scope', value: (r) => r.scope }, ...MODULES.map((m) => ({ header: m.label, value: (r: (typeof ROLES)[number]) => levelFor(matrix, r.key, m.key) }))]}
          />
        }
      />
      <ReadOnlyBanner module="users" />

      {/* Role catalog */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ROLES.map((r) => (
          <div key={r.key} className="op-card bg-white p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#101828] flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#14706B]" /> {r.label}</span>
              <Badge status="neutral" size="sm">{r.scope}</Badge>
            </div>
            <p className="text-xs text-[#475467]">{r.description}</p>
            <div className="text-[10px] font-mono text-[#667085]">
              {assignments.filter((a) => a.role === r.key).length} users · {MODULES.filter((m) => levelFor(matrix, r.key, m.key) !== 'none').length}/{MODULES.length} modules
            </div>
          </div>
        ))}
      </div>

      {/* Matrix */}
      <div className="op-card bg-white overflow-hidden">
        <div className="p-4 border-b border-[#EAECF0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider">Authorization matrix</h2>
            <p className="text-[11px] text-[#667085]">
              {canEdit ? 'Click a cell to cycle: — none → V view → E edit → A approve.' : 'Read-only.'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            {ACCESS_ORDER.map((l) => (
              <span key={l} className={`px-1.5 py-0.5 rounded font-bold ${LEVEL_STYLE[l]}`}>{LEVEL_SYMBOL[l]} {l}</span>
            ))}
            {canEdit && (
              <button onClick={resetMatrix} className="ms-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-[#D0D5DD] text-xs font-semibold text-[#344054]">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse min-w-[960px] w-full">
            <thead>
              <tr className="bg-[#F9FAFB] text-[#667085] border-b border-[#EAECF0]">
                <th className="py-2 px-3 text-start font-semibold sticky start-0 bg-[#F9FAFB]">Role</th>
                {MODULES.map((m) => (
                  <th key={m.key} className="py-2 px-1 font-semibold text-center align-bottom" title={m.group}>
                    <span className="block max-w-[78px] mx-auto leading-tight">{m.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAECF0]">
              {ROLES.map((r) => (
                <tr key={r.key}>
                  <td className="py-2 px-3 font-semibold text-[#101828] whitespace-nowrap sticky start-0 bg-white">{r.label}</td>
                  {MODULES.map((m) => {
                    const l = levelFor(matrix, r.key, m.key);
                    return (
                      <td key={m.key} className="py-1.5 px-1 text-center">
                        <button
                          onClick={() => cycle(r.key, m.key)}
                          disabled={!canEdit}
                          className={`w-8 h-7 rounded font-bold font-mono ${LEVEL_STYLE[l]} ${canEdit ? 'hover:ring-2 hover:ring-[#14706B]/30' : 'cursor-default'}`}
                          aria-label={`${r.label} – ${m.label}: ${l}`}
                          title={`${r.label} – ${m.label}: ${l}`}
                        >
                          {LEVEL_SYMBOL[l]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users */}
      <div className="op-card bg-white overflow-hidden">
        <div className="p-4 border-b border-[#EAECF0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-[#101828] uppercase tracking-wider">User role & store assignment ({assignments.length})</h2>
          <ExportMenu
            title="User Role Assignments"
            module="users"
            rows={assignments}
            columns={[{ header: 'ID', value: (a) => a.id }, { header: 'Name', value: (a) => a.name }, { header: 'Role', value: (a) => roleLabel(a.role) }, { header: 'Store scope', value: (a) => a.store }]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="bg-[#F9FAFB] text-[#667085] border-b border-[#EAECF0]">
                <th className="py-2 px-3 text-start font-semibold">User</th>
                <th className="py-2 px-3 text-start font-semibold">Role</th>
                <th className="py-2 px-3 text-start font-semibold">Store scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAECF0]">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-3"><div className="font-semibold text-[#101828]">{a.name}</div><div className="font-mono text-[10px] text-[#667085]">{a.id}</div></td>
                  <td className="py-2 px-3">
                    <select disabled={!canEdit} value={a.role} onChange={(e) => changeRole(a.id, e.target.value)} className="border border-[#D0D5DD] rounded px-2 py-1 bg-white disabled:bg-[#F9FAFB]">
                      {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <select disabled={!canEdit} value={a.store} onChange={(e) => changeStore(a.id, e.target.value)} className="border border-[#D0D5DD] rounded px-2 py-1 bg-white font-mono disabled:bg-[#F9FAFB]">
                      <option value="ALL">ALL</option>
                      {STORES.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
