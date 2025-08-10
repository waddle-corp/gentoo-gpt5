import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4.1"),
    messages,
    system: `You are an AI assistant that helps operate an online shop.
Provide helpful answers across merchandising, marketing, and customer analytics.
When appropriate, you may propose running a digital clone simulation. 전략을 제안할 때 5개를 넘어가지마. 최대 3-5개 정도만 제안해줘.`,
  });

  return result.toTextStreamResponse();
}
