import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "edge";
export const maxDuration = 30;

function buildHeuristic(stats: any, byScore: Array<{ score: number; positive: number; negative: number; unknown: number }>) {
  const total = Number(stats?.total ?? 0) || 0;
  const p = Number(stats?.p ?? 0) || 0;
  const n = Number(stats?.n ?? 0) || 0;
  const u = Number(stats?.u ?? 0) || 0;
  const top = [...byScore].sort((a, b) => (b.positive - b.negative) - (a.positive - a.negative)).slice(0, 2);
  const low = [...byScore].sort((a, b) => (a.positive - a.negative) - (b.positive - b.negative)).slice(0, 1);
  const bullets: string[] = [];
  bullets.push(`- **Positives**: ${p}/${total}, **Negatives**: ${n}, **Unknown**: ${u}`);
  if (top.length) bullets.push(`- High potential bins: ${top.map((t) => t.score).join(", ")}`);
  if (low.length) bullets.push(`- Weak bin: ${low.map((t) => t.score).join(", ")}`);
  return bullets.join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const stats = body?.stats;
    const byScore = Array.isArray(body?.byScore) ? (body.byScore as Array<{ score: number; positive: number; negative: number; unknown: number }>) : [];

    if (!stats || !Array.isArray(byScore) || byScore.length === 0) {
      return Response.json({ ok: true, insights: buildHeuristic(stats, byScore) });
    }

    const system = `You are a data analyst for an ecommerce simulation. Write concise, high-signal insights for a bubble chart.
Return ONLY 3-5 markdown bullets. DO NOT include a 'Next actions' section.`;

    const prompt = `Chart context:\n- Totals: ${JSON.stringify(stats)}\n- By score (1..30): ${JSON.stringify(byScore)}\nGuidelines:\n- Mention skew/peaks/imbalance.\n- Point to obvious cohorts.\n- Keep it scannable. No next actions.`;

    const run = async () => {
      const { text } = await generateText({ model: openai("gpt-4o"), system, prompt, temperature: 0.3, maxRetries: 0 });
      return (text ?? "").trim();
    };

    let text = "";
    try {
      text = await run();
      if (!text || text.length < 10) {
        text = await generateText({ model: openai("gpt-5-mini"), system, prompt, temperature: 0.5, maxRetries: 0 }).then((r) => (r.text ?? "").trim());
      }
    } catch {}

    if (!text || text.length < 10) {
      const fallback = buildHeuristic(stats, byScore);
      return Response.json({ ok: true, insights: fallback });
    }

    return Response.json({ ok: true, insights: text });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
} 