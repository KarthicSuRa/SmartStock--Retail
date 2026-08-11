// /supabase/functions/_shared/erp-adapter/errors.ts

export class ERPConnectionError extends Error {
  constructor(message: string, public readonly erpType: string) {
    super(message);
    this.name = 'ERPConnectionError';
  }
}

export class ERPAuthError extends Error {
  constructor(message: string, public readonly erpType: string) {
    super(message);
    this.name = 'ERPAuthError';
  }
}

export class ERPBatchPartialFailureError extends Error {
  constructor(
    message: string,
    public readonly succeeded: number,
    public readonly failed: number,
    public readonly failedItems: Array<{ item: any; error: string }>
  ) {
    super(message);
    this.name = 'ERPBatchPartialFailureError';
  }
}

export class ERPCircuitBreakerOpenError extends Error {
  constructor(erpType: string) {
    super(`Circuit breaker is OPEN for ${erpType}. ERP is temporarily unavailable.`);
    this.name = 'ERPCircuitBreakerOpenError';
  }
}
