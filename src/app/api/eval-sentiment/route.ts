import { promises as fs } from "fs";
import path from "path";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

export const runtime = "nodejs";
export const maxDuration = 300;

async function findPromptsFile(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "simulator_prompts.json"), path.join(cwd, "src", "data", "simulator_prompts.json")];
  for (const p of candidates) {
    try { await fs.access(p); return p; } catch {}
  }
  throw new Error("simulator_prompts.json 파일을 찾을 수 없습니다.");
}

function normalizeLabel(text: string): "positive" | "negative" | "unknown" {
  const t = (text || "").toLowerCase();
  if (/(^|\b)(positive|긍정|pos)(\b|$)/.test(t)) return "positive";
  if (/(^|\b)(negative|부정|neg)(\b|$)/.test(t)) return "negative";
  if (/(^|\b)(unknown|중립)(\b|$)/.test(t)) return "unknown";
  return "unknown";
}

async function classifyOne(
  modelName: string,
  question: string,
  entry: any
): Promise<{ label: "positive" | "negative" | "unknown"; reason: string }> {
  // 평가 기준을 더 엄격하게 하여 정보가 부족하면 unknown을 더 자주 반환하도록 프롬프트를 수정함
  const system = `You are a strict ecommerce simulation judge. Output format must be exactly:
<label>::<one-sentence concise, logical reason in English>.
Label must be one of: positive | negative | unknown.

Evaluation rules:
- Be conservative: Assign 'positive' if there is clear, strong evidence supporting a positive outcome.
- Assign 'negative' if there is clear evidence for a negative outcome.
- Assign 'unknown' if information is insufficient, ambiguous, or weak.
- Do NOT overuse 'positive' or 'unknown'. Avoid returning too many 'unknown' labels; if the evidence leans clearly positive or negative, choose accordingly.
- When in doubt, prefer 'unknown', but do not default to it excessively.
- If there is at least some reasonable hint or indication, you may assign 'positive'.`;
  const user = `Persona prompt: ${entry?.prompt ?? ""}\nEngagement score: ${entry?.engagement_score ?? ""}\nHypothesis: ${question}\nRules:\n- Respond in English.\n- After '::', provide a single short sentence with a clear logical structure (premise -> implication -> verdict).\n- Be strict: If there is not enough information, or the evidence is weak, return 'unknown'.`;
  try {
    const { text } = await generateText({ model: openai(modelName), system, prompt: user, maxRetries: 1 });
    const out = String(text || "").trim();
    const parts = out.split("::");
    const label = normalizeLabel(parts[0] || "");
    const reason = (parts.slice(1).join("::") || "").trim() || "Insufficient evidence for a confident judgment.";
    return { label, reason };
  } catch {
    return { label: "unknown", reason: "Model call failed." };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question: string = String(body?.question ?? "");
    const modelName: string = String(body?.model ?? "gpt-4o-mini");
    const concurrency: number = Math.max(1, Math.min(16, Number(body?.concurrency ?? 8)));
    const stream: boolean = Boolean(body?.stream);
    if (!question.trim()) return new Response(JSON.stringify({ ok: false, error: "question이 비었습니다." }), { status: 400, headers: { "content-type": "application/json" } });

    const promptsPath = await findPromptsFile();
    const raw = await fs.readFile(promptsPath, "utf-8");
    const entries: any[] = JSON.parse(raw);

    if (!stream) {
      const results: Array<"positive" | "negative" | "unknown"> = new Array(entries.length).fill("unknown");
      const reasons: string[] = new Array(entries.length).fill("");
      let next = 0;
      async function worker() {
        while (true) {
          const idx = next++;
          if (idx >= entries.length) break;
          const r = await classifyOne(modelName, question, entries[idx]);
          results[idx] = r.label;
          reasons[idx] = r.reason;
        }
      }
      const workers = Array.from({ length: Math.min(concurrency, entries.length) }, () => worker());
      await Promise.all(workers);
      return Response.json({ ok: true, count: results.length, results, reasons });
    }

    const encoder = new TextEncoder();
    const rs = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // meta line
          controller.enqueue(encoder.encode(JSON.stringify({ type: "meta", total: entries.length }) + "\n"));
          let next = 0;
          const worker = async () => {
            while (true) {
              const idx = next++;
              if (idx >= entries.length) break;
              const r = await classifyOne(modelName, question, entries[idx]);
              controller.enqueue(encoder.encode(JSON.stringify({ idx, label: r.label, reason: r.reason }) + "\n"));
            }
          };
          const workers = Array.from({ length: Math.min(concurrency, entries.length) }, () => worker());
          await Promise.all(workers);
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done", count: entries.length }) + "\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: (err as any)?.message || String(err) }) + "\n"));
          controller.close();
        }
      },
    });

    return new Response(rs, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        "connection": "keep-alive",
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
} 