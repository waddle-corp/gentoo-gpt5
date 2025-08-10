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
When appropriate, you may propose running a digital clone simulation. 
When suggesting strategies, do not exceed 5 items—suggest only 3 to 5 at most. 
Please answer in English, and if the user asks in English, always respond in English.
`,
  });

  return result.toTextStreamResponse();
}
