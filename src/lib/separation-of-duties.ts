// /src/lib/separation-of-duties.ts
// SmartStock LiveRetail V2 — Enterprise Separation of Duties (SoD) Enforcer (RC1)

import { TenantRole, hasPermission } from './permissions';

export interface ApproverContext {
  userId: string;
  role: TenantRole;
}

export function validateCountApprovalSoD(
  approver: ApproverContext,
  counterUserId?: string | null
): { allowed: boolean; reason?: string } {
  // 1. Permission check
  if (!hasPermission(approver.role, 'count.approve')) {
    return { allowed: false, reason: `Role ${approver.role} lacks count.approve permission` };
  }

  // 2. Separation of Duties: A staff member who performed the count cannot approve their own adjustment
  if (counterUserId && approver.userId === counterUserId && approver.role !== 'tenant_admin') {
    return {
      allowed: false,
      reason: 'Separation of duties violation: You cannot approve a physical count you performed yourself',
    };
  }

  return { allowed: true };
}
