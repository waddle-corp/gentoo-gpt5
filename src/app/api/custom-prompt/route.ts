export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL = process.env.BASE_URL;
const BASE_URL_PROD = process.env.NEXT_PUBLIC_BASE_URL_PROD;

function getShopIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Next.js provides the dynamic segment in the pathname; extract after /api/custom-prompt/
    const parts = u.pathname.split("/api/custom-prompt/");
    if (parts.length < 2) return null;
    const rest = parts[1];
    const shopId = rest.split("/")[0];
    return shopId || null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    if (!BASE_URL) return new Response(JSON.stringify({ ok: false, error: "BASE_URL is not configured" }), { status: 500 });
    const shopId = getShopIdFromUrl(req.url);
    console.log(`[api/custom-prompt][GET] url=${req.url} -> shopId=${shopId}`);
    if (!shopId) return new Response(JSON.stringify({ ok: false, error: "shopId is required" }), { status: 400 });

    // const extUrl = `${BASE_URL}/api/custom-prompt/${encodeURIComponent(shopId)}`;
    const extUrl = `${BASE_URL_PROD}/api/custom-prompt/${encodeURIComponent(shopId)}`;
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

export async function PUT(req: Request) {
  try {
    if (!BASE_URL) return new Response(JSON.stringify({ ok: false, error: "BASE_URL is not configured" }), { status: 500 });
    const shopId = getShopIdFromUrl(req.url);
    if (!shopId) return new Response(JSON.stringify({ ok: false, error: "shopId is required" }), { status: 400 });
    const body = await req.json().catch(() => ({}));
    console.log(`[api/custom-prompt][PUT] url=${req.url} -> shopId=${shopId} body=`, body);

    // const extUrl = `${BASE_URL}/api/custom-prompt/${encodeURIComponent(shopId)}`;
    const extUrl = `${BASE_URL_PROD}/api/custom-prompt/${encodeURIComponent(shopId)}`;
    console.log(`[api/custom-prompt][PUT] proxy -> ${extUrl}`);
    const res = await fetch(extUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[api/custom-prompt][PUT] upstream status=${res.status}`);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, status: res.status, error: data?.message || res.statusText }),
        { status: res.status }
      );
    }
    return Response.json({ ok: true, data });
  } catch (err: unknown) {
    console.error(`[api/custom-prompt][PUT] error`, err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }), { status: 500 });
  }
}


