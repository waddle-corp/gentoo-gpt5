import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

type Profile = {
  user_id: string;
  normalized_engagement_score?: number;
  activities?: Array<{ event_name?: string }>;
  reviews?: Array<{ review_title?: string; rating?: number; review_content?: string }>;
  dialogues?: Array<{ role?: string; Role?: string }>;
  subscriptions?: Array<any>;
};

function buildProfilePath(userId: string): string[] {
  const cwd = process.cwd();
  const fileName = `profile_${userId}.json`;
  return [
    path.join(cwd, "src", "data", "user_profiles", fileName),
    path.join(cwd, "user_profiles", fileName),
  ];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = String(url.searchParams.get("user_id") || "").trim();
    if (!/^user_\d{5}$/.test(userId)) {
      return new Response(
        JSON.stringify({ ok: false, error: "유효하지 않은 user_id" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    let profilePath: string | null = null;
    for (const p of buildProfilePath(userId)) {
      try { await fs.access(p); profilePath = p; break; } catch {}
    }
    if (!profilePath) {
      return new Response(
        JSON.stringify({ ok: false, error: "프로필 파일을 찾을 수 없습니다." }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    const raw = await fs.readFile(profilePath, "utf-8");
    const profile: Profile = JSON.parse(raw);

    const activities = Array.isArray(profile?.activities) ? profile.activities : [];
    const reviews = Array.isArray(profile?.reviews) ? profile.reviews : [];
    const dialogues = Array.isArray(profile?.dialogues) ? profile.dialogues : [];
    const subscriptions = Array.isArray(profile?.subscriptions) ? profile.subscriptions : [];

    const eventCounts: Record<string, number> = {};
    for (const a of activities) {
      const name = String((a as any)?.event_name ?? "").trim();
      if (!name) continue;
      eventCounts[name] = (eventCounts[name] || 0) + 1;
    }

    const reviewsCount = reviews.length;
    const reviewSummaries = reviews.map((r) => ({
      title: String((r as any)?.review_title ?? "").trim(),
      content: String((r as any)?.review_content ?? "").trim(),
      rating: typeof (r as any)?.rating === "number" ? Math.max(0, Math.min(5, (r as any).rating)) : undefined,
    }));

    const dialoguesTotal = dialogues.length;
    const dialoguesUserCount = dialogues.filter((d) => {
      const role = String(((d as any)?.role ?? (d as any)?.Role ?? "").toString()).toLowerCase();
      return role === "user";
    }).length;

    // Extra aggregates
    let addToCartQtyTotal = 0;
    let addToCartValueTotal = 0;
    const purchaseAmounts: number[] = [];
    for (const a of activities) {
      const name = String((a as any)?.event_name ?? "").trim();
      if (name === "add_to_cart") {
        const q = Number((a as any)?.event_data?.quantity ?? 0) || 0;
        const price = Number((a as any)?.event_data?.price ?? 0) || 0;
        addToCartQtyTotal += q;
        addToCartValueTotal += q * price;
      } else if (name === "purchase_completed") {
        const amount = Number((a as any)?.event_data?.total_amount ?? 0) || 0;
        purchaseAmounts.push(amount);
      }
    }

    return Response.json({
      ok: true,
      user_id: userId,
      normalized_engagement_score: profile?.normalized_engagement_score,
      event_counts: eventCounts,
      reviews_count: reviewsCount,
      review_titles: reviewSummaries.map((r) => r.title).filter((t) => t.length > 0),
      reviews_detail: reviewSummaries,
      dialogues_total: dialoguesTotal,
      dialogues_user_count: dialoguesUserCount,
      subscriptions_count: subscriptions.length,
      add_to_cart_qty_total: addToCartQtyTotal,
      add_to_cart_value_total: Number(addToCartValueTotal.toFixed(2)),
      purchase_amounts: purchaseAmounts,
      path: profilePath,
    });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}


