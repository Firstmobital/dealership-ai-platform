// supabase/functions/_shared/cors.ts
export function getCorsHeaders(req: Request) {
    const origin = req.headers.get("Origin") ?? "";
  
    // Comma-separated allowlist. If empty, default to "*".
    const raw = (Deno.env.get("ALLOWED_ORIGINS") ?? "").trim();
    const allowlist = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  
    const allowOrigin =
      allowlist.length === 0 ? "*" : (allowlist.includes(origin) ? origin : "null");
  
    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Max-Age": "86400",
    } as const;
  }
  
  export function withCors(req: Request, res: Response) {
    const h = new Headers(res.headers);
    const cors = getCorsHeaders(req);
    for (const [k, v] of Object.entries(cors)) h.set(k, v);
    return new Response(res.body, { status: res.status, headers: h });
  }
  
  export function corsPreflight(req: Request) {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  