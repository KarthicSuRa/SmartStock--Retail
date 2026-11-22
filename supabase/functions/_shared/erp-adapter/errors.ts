// /supabase/functions/_shared/erp-adapter/errors.ts
//
// Error taxonomy for ERP writes.
//
// The distinction that matters operationally is:
//
//   DefiniteFailure  - SAP answered, and answered with a rejection. Safe to
//                      correct the payload and retry; no document exists.
//
//   OutcomeUnknown   - the request may or may not have been committed. A
//                      blind retry can therefore create a SECOND, separately
//                      metered business document. These must never be retried
//                      automatically; they must be resolved by probing SAP
//                      for the document first.
//
//   NonRetryable     - retrying cannot help (bad configuration, unsupported
//                      movement type, missing master data).

export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

export class OutcomeUnknownError extends NonRetryableError {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = "OutcomeUnknownError";
  }
}

export class SapConfigurationError extends NonRetryableError {
  constructor(message: string) {
    super(message);
    this.name = "SapConfigurationError";
  }
}

export class UnsupportedMovementError extends NonRetryableError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedMovementError";
  }
}

export function isOutcomeUnknown(err: unknown): boolean {
  if (err instanceof OutcomeUnknownError) return true;
  const e = err as { name?: string; message?: string } | undefined;
  // BaseERPAdapter.executeWithTimeout rejects with exactly this message while the
  // in-flight fetch keeps running, so the commit state is genuinely unknowable.
  return e?.name === "OutcomeUnknownError" || e?.message === "Request timeout";
}

/**
 * A fetch that never produced a definitive HTTP response. The ERP may already
 * have committed the document, so these failures must be reported as
 * outcome-unknown rather than collapsed into a plain `{ success: false }`.
 */
export function isTransportFailure(err: unknown): boolean {
  if (isOutcomeUnknown(err)) return true;
  const e = err as { name?: string; message?: string } | undefined;
  if (!e) return false;
  if (e instanceof TypeError) return true;
  return /fetch failed|network|socket|econn|abort|timeout|terminated/i.test(e.message ?? '');
}

export function isNonRetryable(err: unknown): boolean {
  if (err instanceof NonRetryableError) return true;
  const e = err as { name?: string } | undefined;
  return e?.name === "NonRetryableError" || e?.name === "OutcomeUnknownError"
    || e?.name === "SapConfigurationError" || e?.name === "UnsupportedMovementError";
}
