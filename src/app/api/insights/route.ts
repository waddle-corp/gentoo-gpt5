import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "edge";
export const maxDuration = 30;

function buildReasonThemes(reasons: string[], topK: number = 3): string[] {
  const counts = new Map<string, number>();
  for (const r of reasons || []) {
    const t = String(r || "").trim().toLowerCase();
    if (!t) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topK);
  return sorted.map(([text, c]) => `"${text}" (x${c})`);
}

function buildHeuristic(
  stats: any,
  byScore: Array<{ score: number; positive: number; negative: number; unknown: number }>,
  reasons: string[]
) {
  const total = Number(stats?.total ?? 0) || 0;
  const p = Number(stats?.p ?? 0) || 0;
  const n = Number(stats?.n ?? 0) || 0;
  const u = Number(stats?.u ?? 0) || 0;
  const top = [...byScore].sort((a, b) => (b.positive - b.negative) - (a.positive - a.negative)).slice(0, 2);
  const low = [...byScore].sort((a, b) => (a.positive - a.negative) - (b.positive - b.negative)).slice(0, 1);
  const reasonThemes = buildReasonThemes(reasons || [], 3);

  const bullets: string[] = [];
  // 1) Totals
  bullets.push(`- **Positives**: ${p}/${total}, **Negatives**: ${n}, **Unknown**: ${u}`);
  // 2) High potential bins
  if (top.length) bullets.push(`- High potential bins: ${top.map((t) => t.score).join(", ")}`);
  // 3) Either reason themes or weak bin
  if (reasonThemes.length) {
    bullets.push(`- Common reason themes: ${reasonThemes.join(", ")}`);
  } else if (low.length) {
    bullets.push(`- Weak bin: ${low.map((t) => `${t.score}`).join(", ")}`);
  }
  return bullets.slice(0, 3).join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const stats = body?.stats;
    const byScore = Array.isArray(body?.byScore)
      ? (body.byScore as Array<{ score: number; positive: number; negative: number; unknown: number }>)
      : [];
    const reasons = Array.isArray(body?.reasons) ? body.reasons.map((r: any) => String(r || "")) : [];

    if (!stats || !Array.isArray(byScore) || byScore.length === 0) {
      return Response.json({ ok: true, insights: buildHeuristic(stats, byScore, reasons) });
    }

    const system = `You are a data analyst for an e-commerce simulation.
Your goal is to deliver concise, high-signal INSIGHTS that help operate the shop (merchandising, pricing, promotion, customer targeting).
Integrate the digital clones' reason themes when explaining patterns.
Output MUST be EXACTLY 3 markdown bullets, each a single short sentence (logical, clear, and to the point).
Do NOT include next actions, suggestions, headings, or extra text—bullets only.`;

    const reasonThemes = buildReasonThemes(reasons, 5);
    const reasonsBlock = reasonThemes.length
      ? `\n- Customer rationale themes (top): ${reasonThemes.join(", ")}`
      : "";

    const prompt = `Chart context:\n- Totals: ${JSON.stringify(stats)}\n- By score (1..30): ${JSON.stringify(byScore)}${reasonsBlock}\nTask:\n- Write THREE bullets that are operationally meaningful.\n- Cover: (1) where engagement is strong/weak and WHY (using reason themes), (2) any notable cohort/theme, (3) a brief implication for operations (state implication, not an action).\nStyle:\n- One sentence per bullet; crisp, logical, and easy to scan.\n- Start each bullet with a bold key phrase (e.g., **Strong interest**: ...).\n- No next actions, no headings, no extra prose—bullets only.`;

    const run = async () => {
      const { text } = await generateText({
        model: openai("gpt-5-mini"),
        system,
        prompt,
        temperature: 0.3,
        maxRetries: 0,
      });
      return (text ?? "").trim();
    };

    let text = "";
    try {
      text = await run();
      if (!text || text.length < 10) {
        text = await generateText({ model: openai("gpt-5-mini"), system, prompt, temperature: 0.5, maxRetries: 0 }).then(
          (r) => (r.text ?? "").trim()
        );
      }
    } catch {}

    if (!text || text.length < 10) {
      const fallback = buildHeuristic(stats, byScore, reasons);
      return Response.json({ ok: true, insights: fallback });
    }

    return Response.json({ ok: true, insights: text });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
} 