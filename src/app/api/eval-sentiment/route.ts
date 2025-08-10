import { promises as fs } from "fs";
import path from "path";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 300;

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

function normalizeLabel(text: string): "positive" | "negative" | "unknown" {
  const t = (text || "").toLowerCase();
  if (t.includes("positive") || t.includes("긍정") || t.includes("pos")) return "positive";
  if (t.includes("negative") || t.includes("부정") || t.includes("neg")) return "negative";
  if (t.includes("unknown") || t.includes("중립") || t.includes("unknown")) return "unknown";
  return t.trim() === "positive" || t.trim() === "negative" || t.trim() === "unknown"
    ? (t.trim() as any)
    : "unknown";
}

async function classifyOne(modelName: string, question: string, entry: any): Promise<"positive" | "negative" | "unknown"> {
  const system = `너는 전자상거래 시뮬레이션의 판정기다. 출력은 반드시 다음 중 하나의 단어만 반환하라: positive | negative | unknown`;
  const user = `다음은 한 사용자의 페르소나 요약/프롬프트와, 상점 오너의 질문이다.
- Persona prompt: ${entry?.prompt ?? ""}
- Engagement score: ${entry?.engagement_score ?? ""}
- Owner question: ${question}

이 사용자(클론)가 이 질문을 받았을 때의 반응을 간단히 판정하라.
- 구매 가능성 높거나 호의적 반응이면: positive
- 구매 의사 낮거나 부정적이면: negative
- 불명확하거나 중립이면: unknown
반드시 위 셋 중 하나의 단어만 출력.`;

  try {
    const { text } = await generateText({ model: openai(modelName), system, prompt: user, maxRetries: 1 });
    return normalizeLabel(text);
  } catch {
    return "unknown";
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question: string = String(body?.question ?? "");
    const limit: number | undefined = body?.limit;
    const modelName: string = String(body?.model ?? "gpt-4o-mini");
    const concurrency: number = Math.max(1, Math.min(16, Number(body?.concurrency ?? 8)));

    if (!question.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "question이 비었습니다." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const promptsPath = await findPromptsFile();
    const raw = await fs.readFile(promptsPath, "utf-8");
    const entries: Array<any> = JSON.parse(raw);
    const sliced = Array.isArray(entries) ? (typeof limit === "number" && limit > 0 ? entries.slice(0, limit) : entries) : [];

    // 간단한 동시성 제어
    const results: Array<"positive" | "negative" | "unknown"> = new Array(sliced.length).fill("unknown");
    let next = 0;

    async function worker() {
      while (true) {
        const idx = next++;
        if (idx >= sliced.length) break;
        results[idx] = await classifyOne(modelName, question, sliced[idx]);
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, sliced.length) }, () => worker());
    await Promise.all(workers);

    return Response.json({ ok: true, count: results.length, results });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
} 