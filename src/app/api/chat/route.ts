import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    messages,
    system: `당신은 온라인 쇼핑몰 운영을 도와주는 AI 어시스턴트입니다. 
사용자의 질문에 대해 상품, 마케팅, 고객 분석 등의 관점에서 도움을 제공하세요.
필요시 디지털 클론 시뮬레이션을 제안할 수 있습니다.`,
  });

  return result.toTextStreamResponse();
}
