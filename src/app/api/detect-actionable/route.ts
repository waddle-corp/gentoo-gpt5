import { generateObject, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? (body.messages as Array<{ role: string; content: string }>) : [];
    const lastAssistant = String(body?.lastAssistant ?? "");

    const system = `너는 상점 운영 보조 시스템의 감지기이다. 지금 시점이 "행동 가능한(액셔너블) 가설"을 세워 시뮬레이션을 돌릴 타이밍인지 판정하고, 가설 "제목"만 반환한다.
반드시 JSON으로만 반환한다. 필드: actionable(boolean), hypotheses(string[]), reason(string).
규칙:
- actionable: 시뮬레이션 버튼 노출 여부
- hypotheses: 각 항목은 실행 가능한 가설의 "제목"만 한국어로 작성 (8~40자, 명사구/요약형)
  - 금지: 불릿/번호/따옴표/콜론/대시/마침표, 문장형 종결어미(다/요/니다/합니다/해요/됩니다/있습니다), 일반 전략 키워드(캠페인/프로모션/프로그램/전략/개최/제공/활용)
  - 포함 권장: [대상/세그먼트 또는 상품]+[조치/변경]+(선택)지표
- reason: 짧은 이유`;

    const prompt = `대화 컨텍스트(요약용):\n${JSON.stringify(messages).slice(0, 6000)}\n\n마지막 어시스턴트 메시지:\n"""\n${lastAssistant}\n"""`;

    const schema = jsonSchema({
      type: "object",
      properties: {
        actionable: { type: "boolean" },
        hypotheses: {
          type: "array",
          items: {
            type: "string",
            minLength: 8,
            maxLength: 40,
            pattern: "^(?!.*(캠페인|프로모션|프로그램|전략|개최|제공|활용))(?!.*[•\\-:—\"'。\.])(?!.*(다$|요$|니다$|합니다$|해요$|됩니다$|있습니다$)).+$",
          },
          minItems: 0,
          maxItems: 8,
        },
        reason: { type: "string" },
      },
      required: ["actionable", "hypotheses"],
      additionalProperties: false,
    });

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      system,
      prompt,
      schema,
      temperature: 0.1,
      maxRetries: 1,
    });

    type Out = { actionable: boolean; hypotheses: string[]; reason?: string };
    const out = object as Out;

    const sentenceEnd = /(다|요|니다|합니다|해요|됩니다|있습니다)$/;
    const banned = /(캠페인|프로모션|프로그램|전략|개최|제공|활용)$/;

    const cleaned: string[] = Array.isArray(out?.hypotheses)
      ? (out.hypotheses as string[])
          .map((s: string) => String(s))
          .map((s: string) => s.replace(/["'•\-:\u2014。\.]/g, " ").replace(/\s+/g, " ").trim())
          .filter((s: string) => s.length >= 8 && s.length <= 40)
          .filter((s: string) => !sentenceEnd.test(s))
          .filter((s: string) => !banned.test(s))
      : [];

    // dedupe, keep order
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const s of cleaned) {
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }

    return Response.json({ ok: true, actionable: Boolean(out?.actionable && unique.length > 0), hypotheses: unique, reason: String(out?.reason ?? "") });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
} 