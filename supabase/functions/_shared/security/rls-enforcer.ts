// /supabase/functions/_shared/security/rls-enforcer.ts

export class RLSEnforcer {
  static canAccessStore(userStores: string[], targetStoreId: string, isGlobalAdmin: boolean = false): boolean {
    if (isGlobalAdmin) return true;
    return userStores.includes(targetStoreId);
  }

  static hasPermission(
    userPerms: Record<string, boolean>, 
    requiredPerm: string
  ): boolean {
    return !!userPerms[requiredPerm];
  }
}
