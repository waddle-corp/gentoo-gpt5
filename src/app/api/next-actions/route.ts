import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const stats = body?.stats;
    const byScore = Array.isArray(body?.byScore) ? body.byScore : [];

    const system = `You are a growth operator. Generate ONLY 1-3 concrete next actions (markdown bullets, no prose).`;
    const prompt = `Context:\n- Totals: ${JSON.stringify(stats)}\n- By score (1..30): ${JSON.stringify(byScore)}\nRules:\n- Start each item with a verb; be specific (target, lever, expected effect).\n- 10-80 chars per item; no extra paragraphs.`;

    const { text } = await generateText({ model: openai("gpt-4o-mini"), system, prompt, temperature: 0.4, maxRetries: 1 });
    return Response.json({ ok: true, actions: (text ?? "").trim() });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
} 