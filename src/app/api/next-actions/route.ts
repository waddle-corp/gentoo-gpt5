import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { stats, byScore } = await req.json();

    const system = `You are a strategic growth operator for an e-commerce store. 
Based on simulation results, you must propose 1-3 concrete next actions.
You MUST select one of the four scenarios and one of the five categories to generate actions.

**SCENARIOS:**
1.  **Featured Product Change**: Change the main product on the home screen. Payload should be \`/featured\`.
2.  **Category Discount Event**: A **10%** discount event for a specific category. Payload should be \`/sale/category_name\`.
3.  **Category Coupon Event**: A **10%** coupon event for a specific category. Payload should be \`/coupon/category_name\`.
4.  **Category Time Sale**: A 30-minute time sale for a specific category with a **10%** discount. Payload should be \`/timesale/category_name\`.

**CATEGORIES:**
-   \`baby-accessories\`
-   \`candles\`
-   \`self-care\`
-   \`mothers-day-gifts-under-50\`
-   \`arts-crafts\`

Your response MUST be a JSON object containing a single key "actions" which is an array of objects.
Each action object must have "type", "payload", and "content".
-   \`type\`: Must be 'ui'.
-   \`payload\`: Must be one of the URL formats from the scenarios (e.g., '/sale/baby-accessories').
-   \`content\`: A concise, actionable description of the strategy for the UI (10-80 chars).

**Example Response:**
\`\`\`json
{
  "actions": [
    {
      "type": "ui",
      "payload": "/sale/self-care",
      "content": "Launch a 10% discount on self-care products to boost sales."
    },
    {
      "type": "ui",
      "payload": "/featured",
      "content": "Feature 'artisanal candles' on the homepage to increase visibility."
    }
  ]
}
\`\`\`
`;

    const prompt = `Simulation Results:
- Overall: Positive: ${stats.p}, Negative: ${stats.n}, Unknown: ${stats.u} (Total: ${stats.total})
- Engagement Score Breakdown: ${JSON.stringify(byScore, null, 2)}

Based on these results, provide the next actions.`;

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: z.object({
        actions: z.array(
          z.object({
            type: z.literal("ui"),
            payload: z.string().regex(/^\/(featured|sale\/.+|coupon\/.+|timesale\/.+)/),
            content: z.string().min(10).max(80),
          })
        ).max(3),
      }),
      system,
      prompt,
    });

    console.log("[api/next-actions] Generated actions:", JSON.stringify(object.actions, null, 2));

    return Response.json({ ok: true, actions: object.actions });
  } catch (err: any) {
    console.error("[api/next-actions] error:", err);
    return Response.json({ ok: false, error: err.message || "Failed to generate next actions" }, { status: 500 });
  }
} 