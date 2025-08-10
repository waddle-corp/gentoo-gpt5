// import { openai } from "@ai-sdk/openai";
// import { streamText } from "ai";

// export const runtime = "edge";
// export const maxDuration = 30;

// export async function POST(req: Request) {
//   const { messages } = await req.json();

//   const result = streamText({
//     model: openai("gpt-4.1"),
//     messages,
//     system: `You are an AI assistant that helps operate an online shop.
// Provide helpful answers across merchandising, marketing, and customer analytics.
// When appropriate, you may propose running a digital clone simulation. 
// When suggesting strategies, do not exceed 5 items—suggest only 3 to 5 at most. 
// Please answer in English, and if the user asks in English, always respond in English.
// `,
//   });

//   return result.toTextStreamResponse();
// }


import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

// Vercel Edge Runtime 설정을 나타냅니다.
export const runtime = "edge";
// 최대 실행 시간을 30초로 설정합니다.
export const maxDuration = 30;

export async function POST(req: Request) {
  // 요청 본문에서 메시지를 가져옵니다.
  const { messages } = await req.json();

  // 이 메시지는 모델의 전반적인 행동과 지시사항을 정의합니다.
  const systemPrompt = `You are an **AI assistant that helps operate an online shop**.
Provide helpful answers across merchandising, marketing, and customer analytics. **Keep your answers clear and concise.** Use indent and bold to highlight important information.

When appropriate, you may **propose running a digital clone simulation**. 
When suggesting strategies, **do not exceed 4 items**—suggest only 4 at most. 
Please answer in English, and if the user asks in English, **always respond in English**.

Actionable strategies could include things like:
- Changing the main product on the home screen
- Discount event for a specific category
- Coupon event for a specific category
- 30-minute time sale on all products of a specific category

Only suggest these four strategies; do not mention any others.
`

  // streamText 함수를 사용하여 OpenAI GPT-5 모델로 텍스트 스트림을 생성합니다.
  const result = streamText({
    model: openai("gpt-5-mini"),
    system: systemPrompt,
    messages: messages,
    reasoning: {
      effort: "minimal",
    },
    text: {
      verbosity: "low", // 예시: 'high'로 설정. 필요에 따라 변경하세요.
    },
  });

  // 텍스트 스트림 응답을 반환합니다.
  return result.toTextStreamResponse();
}