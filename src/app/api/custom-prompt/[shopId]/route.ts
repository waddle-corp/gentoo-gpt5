export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const BASE_URL_PROD = process.env.NEXT_PUBLIC_BASE_URL_PROD;

type RouteParams = { shopId: string };

function resolveParams(p: RouteParams | Promise<RouteParams>): Promise<RouteParams> {
  return (p as any)?.then ? (p as Promise<RouteParams>) : Promise.resolve(p as RouteParams);
}

export async function GET(req: Request, ctx: { params: RouteParams | Promise<RouteParams> }) {
  try {
    if (!BASE_URL) return new Response(JSON.stringify({ ok: false, error: "BASE_URL is not configured" }), { status: 500 });
    const envShopId = process.env.NEXT_PUBLIC_ALDEA_SHOP_ID;
    const { shopId: raw } = await resolveParams(ctx.params as any);
    const shopId = String(envShopId || raw || "").trim();
    console.log(`[api/custom-prompt][GET] url=${req.url} -> shopId=${shopId} (env=${envShopId ? 'Y' : 'N'})`);
    if (!shopId) return new Response(JSON.stringify({ ok: false, error: "shopId is required" }), { status: 400 });

    // const extUrl = `${BASE_URL}/api/custom-prompt/${encodeURIComponent(shopId)}`;
    const extUrl = `${BASE_URL_PROD}/app/api/custom-prompt/${encodeURIComponent(shopId)}`;
    console.log(`[api/custom-prompt][GET] proxy -> ${extUrl}`);
    const res = await fetch(extUrl, {
      method: "GET",
      headers: { "content-type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[api/custom-prompt][GET] upstream status=${res.status}`);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: res.status, error: data?.message || res.statusText }),
        { status: res.status }
      );
    }
    return Response.json({ ok: true, data });
  } catch (err: unknown) {
    console.error(`[api/custom-prompt][GET] error`, err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }), { status: 500 });
  }
}

export async function PUT(req: Request, ctx: { params: RouteParams | Promise<RouteParams> }) {
  try {
    if (!BASE_URL) return new Response(JSON.stringify({ ok: false, error: "BASE_URL is not configured" }), { status: 500 });
    const envShopId = process.env.NEXT_PUBLIC_ALDEA_SHOP_ID;
    const { shopId: raw } = await resolveParams(ctx.params as any);
    const shopId = String(envShopId || raw || "").trim();
    if (!shopId) return new Response(JSON.stringify({ ok: false, error: "shopId is required" }), { status: 400 });
    const body = await req.json().catch(() => ({}));
    console.log(`[api/custom-prompt][PUT] url=${req.url} -> shopId=${shopId} (env=${envShopId ? 'Y' : 'N'}) body=`, body);

    // const extUrl = `${BASE_URL}/api/custom-prompt/${encodeURIComponent(shopId)}`;
    const extUrl = `${BASE_URL_PROD}/app/api/custom-prompt/${encodeURIComponent(shopId)}`;
    console.log(`[api/custom-prompt][PUT] proxy -> ${extUrl}`);
    const res = await fetch(extUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    console.log("res", res);
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    console.log(`[api/custom-prompt][PUT] upstream status=${res.status} body=`, data);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: res.status, error: data?.message || data?.error || data?.raw || res.statusText }),
        { status: res.status }
      );
    }
    return Response.json({ ok: true, data });
  } catch (err: unknown) {
    console.error(`[api/custom-prompt][PUT] error`, err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }), { status: 500 });
  }
}


