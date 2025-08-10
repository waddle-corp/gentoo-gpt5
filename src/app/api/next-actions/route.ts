import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { stats, byScore, hypothesis } = await req.json();

    const system = `You are a strategic growth operator for an e-commerce store. 
Based on simulation results FOR A SPECIFIC HYPOTHESIS, you must propose exactly 4 concrete next actions.
The user ran a simulation for the following hypothesis: "${hypothesis || 'Not provided'}"
**ALL actions MUST be directly related to this hypothesis.**

Your response MUST be a JSON object with four keys: \`ui_action_1\`, \`ui_action_2\`, \`chat_action\`, and \`start_example_action\`.

**SCENARIOS:**
1.  **Featured Product Change**: Type \`ui\`, payload \`/featured\`.
2.  **Category Discount Event**: A **10%** discount event for a specific category. Payload should be \`/sale/category_name\`.
3.  **Category Coupon Event**: A **10%** coupon event for a specific category. Payload should be \`/coupon/category_name\`.
4.  **Category Time Sale**: A 30-minute time sale for a specific category with a **10%** discount. Payload should be \`/timesale/category_name\`.
위의 모든 시나리오와 병행할 수 있는 'start-example' type 에서는 시작 예시에 해당하는 문구를 생성해서 전달할 수 있습니다. 전반적으로 이전의 내용과 관련있는 시작예시를 생성하세요. 
'chat' type 에서는 앞의 내용과 관련있는 내용으로 AI 챗봇이 답을 할 수 있도록 안내하는 가이드라인을 출력합니다.

**CATEGORIES:**
-   \`baby-accessories\`
-   \`candles\`
-   \`self-care\`
-   \`mothers-day-gifts-under-50\`
-   \`arts-crafts\`

Your response MUST be a JSON object containing a single key "actions" which is an array of objects.
Each action object must have "type", "payload", and "content".
-   \`type\`: 'ui' or 'start-example' or 'chat'.
-   \`payload\`: for 'ui' type, must be one of the URL formats from the scenarios (e.g., '/sale/baby-accessories').
-   \`payload\`: for 'start-example' type, must be a string of example phrases (e.g., 'gift baby accessories/toys for 6 months/cute baby items').
-   \`payload\`: for 'chat' type, must be a string of example phrases (e.g., 'recommend discount event for baby accessories').
-   \`content\`: A concise, actionable description for the UI (10-80 chars).

**Example Response:**
\`\`\`json
{
  "ui_action_1": { "type": "ui", "payload": "/sale/self-care", "content": "Launch a 10% discount on self-care products." },
  "ui_action_2": { "type": "ui", "payload": "/featured", "content": "Feature 'artisanal candles' on the homepage." },
  "chat_action": { "type": "chat", "payload": "What are our best-selling candles?", "content": "Ask about best-selling candles." },
  "start_example_action": { "type": "start-example", "payload": "candles for relaxation", "content": "Search for relaxing candles." }
}
\`\`\`
`;

    const prompt = `Simulation Results:
- Overall: Positive: ${stats.p}, Negative: ${stats.n}, Unknown: ${stats.u} (Total: ${stats.total})
- Engagement Score Breakdown: ${JSON.stringify(byScore, null, 2)}

Based on these results for the hypothesis "${hypothesis || 'Not provided'}", provide the next actions.`;

    let object: { 
      ui_action_1: { type: "ui"; payload: string; content: string };
      ui_action_2: { type: "ui"; payload: string; content: string };
      chat_action: { type: "chat"; payload: string; content: string };
      start_example_action: { type: "start-example"; payload: string; content: string };
     };

    try {
      const result = await generateObject({
        model: openai("gpt-4o"),
        schema: z.object({
          ui_action_1: z.object({ type: z.literal("ui"), payload: z.string().min(1), content: z.string().min(10).max(80) }),
          ui_action_2: z.object({ type: z.literal("ui"), payload: z.string().min(1), content: z.string().min(10).max(80) }),
          chat_action: z.object({ type: z.literal("chat"), payload: z.string().min(1), content: z.string().min(10).max(80) }),
          start_example_action: z.object({ type: z.literal("start-example"), payload: z.string().min(1), content: z.string().min(10).max(80) }),
        }),
        system,
        prompt,
      });
      object = result.object;
    } catch (error) {
      console.error("[api/next-actions] AI generation failed, using fallback:", error);
      object = {
        ui_action_1: { type: "ui", payload: "/featured", content: "Feature a popular item on the homepage." },
        ui_action_2: { type: "ui", payload: "/sale/self-care", content: "Run a 10% sale on self-care items." },
        chat_action: { type: "chat", payload: "What other categories are popular?", content: "Ask about other popular categories." },
        start_example_action: { type: "start-example", payload: "promotional ideas for candles", content: "Search for candle promotion ideas." },
      };
    }

    const actions = [object.ui_action_1, object.ui_action_2, object.chat_action, object.start_example_action];
    console.log("[api/next-actions] Generated actions:", JSON.stringify(actions, null, 2));

    return Response.json({ ok: true, actions });
  } catch (err: any) {
    console.error("[api/next-actions] error:", err);
    return Response.json({ ok: false, error: err.message || "Failed to generate next actions" }, { status: 500 });
  }
} 