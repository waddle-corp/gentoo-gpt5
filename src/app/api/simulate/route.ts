import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PromptEntry {
  user_id: string;
  summary?: string;
  prompt: string;
  engagement_score?: number;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  turn_duration?: number;
}

interface ConversationResult {
  clone_id: number;
  user_id: string;
  persona: string;
  messages: Message[];
  total_duration: number;
  done: boolean;
  engagement: {
    engaged: boolean;
    confidence: number;
    reason: string;
    score: number;
  } | null;
}

function generateUserUtterance(entry: PromptEntry): string {
  const base = entry.prompt?.trim() || "";
  const short = base.length > 120 ? base.slice(0, 117) + "..." : base;
  return `제 상황: ${short} 이에요. 오늘 어떤 제품을 보면 좋을까요?`;
}

function generateAssistantReply(score: number | undefined, summary?: string): string {
  const s = typeof score === "number" ? score : 10;
  const head = s >= 15 ? "지금 니즈에 맞는 옵션 몇 가지를 추천드릴게요." : "간단히 방향부터 정리해볼게요.";
  const tail = summary ? ` (${summary})` : "";
  if (s >= 20) return `${head} 예산/취향 알려주시면 더 정교하게 맞출 수 있어요.${tail}`;
  if (s >= 10) return `${head} 검색/장바구니 이력 기준으로 무난한 선택부터 보시죠.${tail}`;
  return `${head} 우선 선호도/가격대를 알려주시면 기본 옵션부터 추천드릴게요.${tail}`;
}

function deriveEngagement(score: number | undefined) {
  const sc = typeof score === "number" ? Math.max(1, Math.min(30, score)) : 10;
  const engaged = sc >= 15;
  const confidence = Math.min(1, 0.4 + sc / 40);
  const reason = "score 기반 자동 판정";
  return { engaged, confidence, reason, score: sc };
}

async function findPromptsFile(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "simulator_prompts.json"), path.join(cwd, "src", "data", "simulator_prompts.json")];
  for (const p of candidates) {
    try { await fs.access(p); return p; } catch {}
  }
  throw new Error("simulator_prompts.json 파일을 찾을 수 없습니다.");
}

async function findResultsFile(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "simulation_results.json"), path.join(cwd, "src", "data", "simulation_results.json")];
  for (const p of candidates) {
    try { await fs.access(p); return p; } catch {}
  }
  throw new Error("simulation_results.json 파일을 찾을 수 없습니다. 먼저 시뮬레이션을 실행해 생성하세요.");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const limit: number | undefined = body?.limit;

    const promptsPath = await findPromptsFile();
    const raw = await fs.readFile(promptsPath, "utf-8");
    const entries: PromptEntry[] = JSON.parse(raw);

    const sliced = Array.isArray(entries) ? (typeof limit === "number" && limit > 0 ? entries.slice(0, limit) : entries) : [];

    const results: ConversationResult[] = sliced.map((entry, idx) => {
      const userText = generateUserUtterance(entry);
      const assistantText = generateAssistantReply(entry.engagement_score, entry.summary);
      const turnDuration = 0.2 + Math.random() * 0.8;
      const engagement = deriveEngagement(entry.engagement_score);
      const messages: Message[] = [
        { role: "user", content: userText, turn_duration: parseFloat(turnDuration.toFixed(3)) },
        { role: "assistant", content: assistantText },
      ];
      return {
        clone_id: idx,
        user_id: entry.user_id,
        persona: entry.user_id,
        messages,
        total_duration: parseFloat(turnDuration.toFixed(3)),
        done: true,
        engagement,
      };
    });

    const cwd = process.cwd();
    const outCandidates = [path.join(cwd, "simulation_results.json"), path.join(cwd, "src", "data", "simulation_results.json")];
    let savedPath: string | null = null;
    for (const outPath of outCandidates) {
      try { await fs.writeFile(outPath, JSON.stringify(results, null, 2), "utf-8"); savedPath = outPath; break; } catch {}
    }
    if (!savedPath) throw new Error("simulation_results.json 저장에 실패했습니다.");

    return Response.json({ ok: true, count: results.length, output: savedPath });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    if (url.searchParams.get("prompts") === "1") {
      const promptsPath = await findPromptsFile();
      const raw = await fs.readFile(promptsPath, "utf-8");
      const entries: any[] = JSON.parse(raw);
      const list = entries.map((e, idx) => ({ idx, user_id: e.user_id, engagement_score: Math.max(1, Math.min(30, Number(e.engagement_score ?? 0) || 1)) }));
      return Response.json({ ok: true, count: list.length, prompts: list, path: promptsPath });
    }

    const resultsPath = await findResultsFile();
    const raw = await fs.readFile(resultsPath, "utf-8");
    const arr: any[] = JSON.parse(raw);

    const counts = Array.from({ length: 30 }, () => 0);
    for (const item of arr) {
      const score = Math.max(1, Math.min(30, Number(item?.engagement?.score ?? 0) || 0));
      if (score >= 1 && score <= 30) counts[score - 1] += 1;
    }
    const histogram = counts.map((count, i) => ({ score: i + 1, count }));

    return Response.json({ ok: true, count: arr.length, histogram, path: resultsPath });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
} 