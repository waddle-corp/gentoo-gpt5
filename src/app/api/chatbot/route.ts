export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const BASE_URL_PROD = process.env.NEXT_PUBLIC_BASE_URL_PROD;

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
    const extUrl = `${BASE_URL_PROD}/app/api/chatbot/v1/${partnerId}/${chatbotId}`;
    console.log("extUrl", extUrl);
    // const extUrl = `${BASE_URL}/app/api/chatbot/v1/6889c78b02f0e1e4d72979b6/506`;
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
    console.log("[api/chatbot][PUT] incoming body=", body);
    const partnerId = process.env.NEXT_PUBLIC_ALDEA_PARTNER_ID;
    const chatbotId = process.env.NEXT_PUBLIC_ALDEA_CHATBOT_ID;
    console.log("partnerId", partnerId);
    console.log("chatbotId", chatbotId);
    const inputExamples: unknown = body?.examples;
    let startExampleText = String(body?.startExampleText ?? "");
    let cleanedExamples: string[] = [];
    
    // Allow client to send examples array; convert to startExampleText for upstream
    if (Array.isArray(inputExamples)) {
      const cleaned = inputExamples
        .map((v) => String(v ?? "").trim())
        .filter((v) => v.length > 0)
        .slice(0, 3);
      if (cleaned.length > 0) {
        startExampleText = cleaned.join("|");
        cleanedExamples = cleaned;
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

    // Build full update body (sanitize to allowed fields)
    const allowedKeys = new Set([
      "chatBotId",
      "name",
      "profileImg",
      "greetingMessage",
      "colorCode",
      "recommendSize",
      "carouselType",
      "exceptKeyword",
      "examples",
      "chatAgent",
      "position",
      "mobilePosition",
      "avatarId",
    ]);
    const fullBody: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body || {})) {
      if (allowedKeys.has(k)) fullBody[k] = v as any;
    }
    if (cleanedExamples.length > 0) fullBody.examples = cleanedExamples;

    const baseHost = BASE_URL_PROD || BASE_URL;
    const primary = `${baseHost}/app/api/chatbot/v1/${partnerId}/${chatbotId}`;
    console.log("[api/chatbot][PUT] proxy(primary) ->", primary, "payload keys:", Object.keys(fullBody));
    let res = await fetch(primary, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(fullBody),
    });
    // Fallback route when not OK
    if (!res.ok) {
      const alt = `${baseHost}/app/api/chatbot/v1/${partnerId}/${chatbotId}/examples`;
      console.log("[api/chatbot][PUT] primary failed status=", res.status, ". Retrying ->", alt);
      res = await fetch(alt, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startExampleText }),
      });
      if (!res.ok) {
        const alt2Body = { examples: (cleanedExamples.length ? cleanedExamples : startExampleText.split("|").map((s) => s.trim()).filter(Boolean)).slice(0, 3) };
        console.log("[api/chatbot][PUT] secondary failed status=", res.status, ". Retrying with examples[] ->", alt, alt2Body);
        res = await fetch(alt, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(alt2Body),
        });
      }
    }

    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    console.log("[api/chatbot][PUT] upstream status=", res.status, "body=", data);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, status: res.status, error: data?.message || data?.error || data?.raw || res.statusText }), { status: res.status });
    }
    return Response.json({ ok: true, data });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }), { status: 500 });
  }
}


