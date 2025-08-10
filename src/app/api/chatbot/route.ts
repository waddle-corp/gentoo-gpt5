export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function GET(req: Request) {
  try {
    const partnerId = process.env.NEXT_PUBLIC_ALDEA_PARTNER_ID;
    const chatbotId = process.env.NEXT_PUBLIC_ALDEA_CHATBOT_ID;
    console.log("BASE_URL", BASE_URL);
    console.log("partnerId", partnerId);
    console.log("chatbotId", chatbotId);

    if (!partnerId || !chatbotId) {
      console.error("partnerId/chatbotId is required");
      return new Response(
        JSON.stringify({ ok: false, error: "Missing NEXT_PUBLIC_ALDEA_PARTNER_ID or NEXT_PUBLIC_ALDEA_CHATBOT_ID" }),
        { status: 500 }
      );
    }
    if (!BASE_URL) {
      console.error("BASE_URL is required");
      return new Response(
        JSON.stringify({ ok: false, error: "Missing BASE_URL env" }),
        { status: 500 }
      );
    }

    // const extUrl = `${BASE_URL}/app/api/chatbot/v1/${partnerId}/${chatbotId}`;
    const extUrl = `${BASE_URL}/app/api/chatbot/v1/6889c78b02f0e1e4d72979b6/506`;
    const res = await fetch(extUrl, {
      method: "GET",
      headers: {
        "content-type": "application/json",
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    console.log("data", data);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, status: res.status, error: data?.message || res.statusText }), { status: res.status });
    }

    return Response.json({ ok: true, data });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }), { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const partnerId = process.env.NEXT_PUBLIC_ALDEA_PARTNER_ID;
    const chatbotId = process.env.NEXT_PUBLIC_ALDEA_CHATBOT_ID;
    const inputExamples: unknown = body?.examples;
    let startExampleText = String(body?.startExampleText ?? "");

    // Allow client to send examples array; convert to startExampleText for upstream
    if (Array.isArray(inputExamples)) {
      const cleaned = inputExamples
        .map((v) => String(v ?? "").trim())
        .filter((v) => v.length > 0)
        .slice(0, 3);
      if (cleaned.length > 0) {
        startExampleText = cleaned.join("|");
      }
    }

    if (!partnerId || !chatbotId) {
      console.error("partnerId/chatbotId is required");
      return new Response(
        JSON.stringify({ ok: false, error: "Missing NEXT_PUBLIC_ALDEA_PARTNER_ID or NEXT_PUBLIC_ALDEA_CHATBOT_ID" }),
        { status: 500 }
      );
    }
    if (!BASE_URL) {
      console.error("BASE_URL is required");
      return new Response(
        JSON.stringify({ ok: false, error: "Missing BASE_URL env" }),
        { status: 500 }
      );
    }
    if (!startExampleText) {
      console.error("startExampleText is required");
      return new Response(
        JSON.stringify({ ok: false, error: "startExampleText is required" }),
        { status: 400 }
      );
    }

    const extUrl = `${BASE_URL}/api/chatbot/v1/${partnerId}/${chatbotId}`;
    const res = await fetch(extUrl, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ startExampleText }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, status: res.status, error: data?.message || res.statusText }), { status: res.status });
    }
    return Response.json({ ok: true, data });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }), { status: 500 });
  }
}


