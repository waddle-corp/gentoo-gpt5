export const runtime = "edge";
export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const actions: string[] = Array.isArray(body?.actions) ? body.actions : [];
    const board: string = String(body?.board ?? "");
    // TODO: implement actual deploy logic later
    return Response.json({ ok: true, deployed: actions.length, board });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
} 