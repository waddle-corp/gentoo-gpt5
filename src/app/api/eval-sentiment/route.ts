import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

async function findPromptsFile(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "simulator_prompts.json"),
    path.join(cwd, "src", "data", "simulator_prompts.json"),
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  throw new Error("simulator_prompts.json 파일을 찾을 수 없습니다.");
}

function decideLabel(question: string, entry: any): "positive" | "negative" | "unknown" {
  const q = (question || "").toLowerCase();
  const p = (entry?.prompt || "").toLowerCase();
  const score = Number(entry?.engagement_score ?? 0) || 0;

  const posKeywords = ["추천", "recommend", "좋", "best", "가성비", "value", "선물", "fit", "pair"];
  const negKeywords = ["불만", "나쁘", "싫", "bad", "refund", "cancel", "취소", "별로"];

  const hasPos = posKeywords.some((k) => q.includes(k) || p.includes(k));
  const hasNeg = negKeywords.some((k) => q.includes(k) || p.includes(k));

  if (hasPos && !hasNeg) return "positive";
  if (hasNeg && !hasPos) return "negative";

  if (score >= 20) return "positive";
  if (score <= 5) return "negative";

  return "unknown";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question: string = String(body?.question ?? "");
    if (!question.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "question이 비었습니다." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const promptsPath = await findPromptsFile();
    const raw = await fs.readFile(promptsPath, "utf-8");
    const entries: Array<any> = JSON.parse(raw);

    const results = entries.map((e) => decideLabel(question, e));

    return Response.json({ ok: true, count: results.length, results });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
} 