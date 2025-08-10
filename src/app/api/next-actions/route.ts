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

**ACTION TYPES AND COUNT:**
- You MUST generate **2 actions of type 'ui'**.
- You MUST generate **1 action of type 'chat'**.
- You MUST generate **1 action of type 'start-example'**.

**SCENARIOS:**
1.  **Featured Product Change**: Type \`ui\`, payload \`/featured\`.
2.  **Category Discount Event**: A **10%** discount event for a specific category. Payload should be \`/sale/category_name\`.
3.  **Category Coupon Event**: A **10%** coupon event for a specific category. Payload should be \`/coupon/category_name\`.
4.  **Category Time Sale**: A 30-minute time sale for a specific category with a **10%** discount. Payload should be \`/timesale/category_name\`.
5.  **Start Example Search**: Type is \`start-example\`, and the payload should be a search query string that is directly related to the hypothesis. This action will be used as the initial example phrase shown when the Gentoo Chatbot starts, so the content must clearly indicate that it is a "Gentoo Chatbot start example" and must be relevant to the hypothesis. For example: "Add start example to Gentoo Chatbot: [start example]" (where [start example] is a search query related to the hypothesis).
6.  **Initiate Chat**: Type \`chat\`, payload is an opening chat message. **This MUST be related to the hypothesis.**

**CATEGORIES:**
-   \`baby-accessories\`
-   \`candles\`
-   \`self-care\`
-   \`mothers-day-gifts-under-50\`
-   \`arts-crafts\`

Your response MUST be a JSON object with four keys: \`ui_action_1\`, \`ui_action_2\`, \`chat_action\`, and \`start_example_action\`.
Each action object must have "type", "payload", and "content".
-   \`type\`: Must be one of 'ui', 'start-example', 'chat'.
-   \`payload\`: For 'ui', use URL format. For others, use a string. Use exact category names.
-   \`content\`: A concise, actionable description for the UI (10-120 chars). **The content for all actions must be relevant to the original hypothesis.**
    - **For 'chat' type actions, the \`content\` MUST follow the format: "Have AI assistant Gentoo guide customers to [action]" (e.g., "Have AI assistant Gentoo guide customers check for new candle promotions"). The \`payload\` should be the actual message the assistant will deliver to the customers.**

**Example Response:**
\`\`\`json
{
  "ui_action_1": { "type": "ui", "payload": "/sale/self-care", "content": "Launch a 10% discount on self-care products." },
  "ui_action_2": { "type": "ui", "payload": "/featured", "content": "Feature 'artisanal candles' on the homepage." },
  "chat_action": { "type": "chat", "payload": "Did you know all our self-care products are 10% off this week?", "content": "Have AI assistant Gentoo guide customers about self-care product discounts." },
  "start_example_action": { "type": "start-example", "payload": "candles for relaxation", "content": "Add start example to Gentoo Chatbot: candles for relaxation." }
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
        model: openai("gpt-4.1"),
        schema: z.object({
          ui_action_1: z.object({ type: z.literal("ui"), payload: z.string().min(1), content: z.string().min(10).max(120) }),
          ui_action_2: z.object({ type: z.literal("ui"), payload: z.string().min(1), content: z.string().min(10).max(120) }),
          chat_action: z.object({ type: z.literal("chat"), payload: z.string().min(1), content: z.string().min(10).max(120) }),
          start_example_action: z.object({ type: z.literal("start-example"), payload: z.string().min(1), content: z.string().min(10).max(120) }),
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
        chat_action: { type: "chat", payload: "What other categories are popular?", content: "Have AI assistant Gentoo guide customers about other popular categories." },
        start_example_action: { type: "start-example", payload: "promotional ideas for candles", content: "Add start example to Gentoo Chatbot: promotional ideas for candles." },
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