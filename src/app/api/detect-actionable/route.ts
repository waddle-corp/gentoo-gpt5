import { generateObject, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";

export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? (body.messages as Array<{ role: string; content: string }>) : [];
    const lastAssistant = String(body?.lastAssistant ?? "");

    const system = `You are a detector for a shop-ops assistant. Your primary goal is to determine if a user should be prompted to run a simulation.
You MUST return a JSON object with fields: actionable(boolean), hypotheses(string[]), reason(string).

**Hard Rules:**
1.  **If the last assistant message explicitly asks to run a simulation (e.g., "Would you like to explore this option?"), you MUST set actionable=true.**
2.  **If the message lists concrete strategies (e.g., under 'Merchandising', 'Marketing'), you MUST extract 1-3 concise titles as hypotheses and set actionable=true.**
3.  Even if strategies are generic, distill 1-2 relevant hypothesis titles.
4.  Hypothesis titles MUST be concise (4-50 chars), in English or Korean, and in a noun-phrase style. Avoid punctuation.

Examples of good hypotheses titles:
- "Expand product range for AOV lift"
- "Bundle offers for accessories"
- "Personalized recommendations for high-intent users"
`;

    const prompt = `Based on the rules, analyze the last assistant message in the context of the conversation and generate the JSON response.

Conversation context (for summarization):
${JSON.stringify(messages).slice(0, 6000)}

Last assistant message:
"""
${lastAssistant}
"""`;

    const schema = jsonSchema({
      type: "object",
      properties: {
        actionable: { type: "boolean", description: "Set to true if a simulation should be proposed." },
        hypotheses: {
          type: "array",
          description: "A list of 3-5 concise, actionable hypothesis titles. MUST NOT be empty if actionable is true.",
          items: {
            type: "string",
            minLength: 4,
            maxLength: 50,
          },
        },
        reason: { type: "string", description: "A brief rationale for your decision." },
      },
      required: ["actionable", "hypotheses", "reason"],
    });

    const { object } = await generateObject({
      model: openai("gpt-4.1-mini"),
      system,
      prompt,
      schema,
      temperature: 0.1,
      maxRetries: 1,
    });

    type Out = { actionable: boolean; hypotheses: string[]; reason?: string };
    const out = object as Out;

    const cleaned: string[] = Array.isArray(out?.hypotheses)
      ? out.hypotheses
          .map((s) => String(s).replace(/["'•\-:\u2014。\.]/g, "").trim())
          .filter((s) => s.length >= 4 && s.length <= 50)
      : [];
      
    const unique = [...new Set(cleaned)];

    // Final check: if the model returns actionable but no hypotheses, it's a failure.
    const isActionable = out.actionable && unique.length > 0;

    console.log("[detect-actionable] Input:", lastAssistant.slice(0, 100));
    console.log("[detect-actionable] Output:", { isActionable, hypotheses: unique, reason: out.reason });

    return Response.json({ ok: true, actionable: isActionable, hypotheses: unique, reason: String(out?.reason ?? "") });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[detect-actionable] Critical Error:", error.message, error.stack);
    return new Response(JSON.stringify({ ok: false, error: error.message || String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
} 