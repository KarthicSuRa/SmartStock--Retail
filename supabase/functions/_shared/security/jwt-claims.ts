// /supabase/functions/_shared/security/jwt-claims.ts

export interface StoreClaim {
  store_id: string;
  level: string;
  perms: {
    approve: boolean;
    emergency: boolean;
    adjust_safety: boolean;
  };
}

export interface UserJWTClaims {
  tenant_id: string;
  role: string;
  stores: StoreClaim[];
  global_perms: {
    view_all: boolean;
    audit: boolean;
    financials: boolean;
  };
  issued_at: number;
}

export class JWTClaimsManager {
  static extractClaims(jwtPayload: any): UserJWTClaims | null {
    return jwtPayload?.app_metadata?.live_retail_claims || null;
  }
}
