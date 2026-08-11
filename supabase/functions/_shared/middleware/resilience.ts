// /supabase/functions/_shared/middleware/resilience.ts

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-pos-config-id',
};

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const TIMEOUT_MS = 25000; // 25s execution cutoff

export async function withResilienceHandler(
  req: Request,
  handler: (req: Request) => Promise<Response>
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return new Response(
      JSON.stringify({ error: 'Payload too large (10MB maximum limit exceeded)' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 413 }
    );
  }

  const timeoutPromise = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error('Edge function request timeout (25s exceeded)')), TIMEOUT_MS)
  );

  try {
    const response = await Promise.race([handler(req), timeoutPromise]);
    return response;
  } catch (error) {
    console.error('[resilience-middleware] Execution error or timeout:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 504 }
    );
  }
}
