// /supabase/functions/_shared/execution/batch-executor.ts

export class BatchExecutor {
  constructor(private supabase: any) {}

  categorizeError(error: string): string {
    const lower = error.toLowerCase();
    if (lower.includes('timeout') || lower.includes('econnrefused')) return 'TIMEOUT';
    if (lower.includes('unauthorized') || lower.includes('auth')) return 'AUTH';
    if (lower.includes('not found') || lower.includes('does not exist')) return 'VALIDATION';
    if (lower.includes('blocked') || lower.includes('closed') || lower.includes('cannot be')) return 'SAP_BUSINESS_ERROR';
    return 'NETWORK';
  }
}
