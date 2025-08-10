import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

type PromptEntry = {
  user_id: string;
  summary?: string;
  prompt?: string;
  engagement_score?: number;
};

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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idxParam = url.searchParams.get("idx");
    const idx = Number(idxParam);

    if (!Number.isInteger(idx) || idx < 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "유효하지 않은 idx 파라미터" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const filePath = await findPromptsFile();
    const raw = await fs.readFile(filePath, "utf-8");
    const entries: PromptEntry[] = JSON.parse(raw);

    if (!Array.isArray(entries) || idx >= entries.length) {
      return new Response(
        JSON.stringify({ ok: false, error: "해당 인덱스의 항목을 찾을 수 없습니다." }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    const entry = entries[idx] as PromptEntry;
    const score =
      typeof entry?.engagement_score === "number"
        ? Math.max(1, Math.min(30, entry.engagement_score))
        : undefined;

    return Response.json({
      ok: true,
      idx,
      user_id: entry?.user_id ?? String(idx),
      summary: entry?.summary ?? "",
      prompt: entry?.prompt ?? "",
      engagement_score: score,
      path: filePath,
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}


