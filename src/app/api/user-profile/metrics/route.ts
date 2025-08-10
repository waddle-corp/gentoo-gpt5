import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

type Profile = {
  activities?: Array<{ event_name?: string; event_data?: any }>;
  reviews?: Array<any>;
  subscriptions?: Array<any>;
  dialogues?: Array<any>;
};

async function getProfilesDir(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, "src", "data", "user_profiles"), path.join(cwd, "user_profiles")];
  for (const p of candidates) {
    try {
      const stat = await fs.stat(p);
      if (stat.isDirectory()) return p;
    } catch {}
  }
  throw new Error("user_profiles 디렉토리를 찾을 수 없습니다.");
}

function quantile(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (a[base + 1] !== undefined) return a[base] + rest * (a[base + 1] - a[base]);
  return a[base];
}

export async function GET() {
  try {
    const dir = await getProfilesDir();
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));

    const pv: number[] = [];
    const atc: number[] = [];
    const pc: number[] = [];
    const rv: number[] = [];
    const sub: number[] = [];
    const dlg: number[] = [];

    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const p: Profile = JSON.parse(raw);
        const acts = Array.isArray(p.activities) ? p.activities : [];
        const counts: Record<string, number> = { product_view: 0, add_to_cart: 0, purchase_completed: 0 };
        for (const a of acts) {
          const n = String((a as any)?.event_name ?? "");
          if (counts[n] !== undefined) counts[n] += 1;
        }
        pv.push(counts.product_view);
        atc.push(counts.add_to_cart);
        pc.push(counts.purchase_completed);
        rv.push(Array.isArray(p.reviews) ? p.reviews.length : 0);
        sub.push(Array.isArray(p.subscriptions) ? p.subscriptions.length : 0);
        dlg.push(Array.isArray(p.dialogues) ? p.dialogues.length : 0);
      } catch {}
    }

    const max = {
      product_view: Math.max(0, ...pv, 0),
      add_to_cart: Math.max(0, ...atc, 0),
      purchase_completed: Math.max(0, ...pc, 0),
      reviews: Math.max(0, ...rv, 0),
      subscriptions: Math.max(0, ...sub, 0),
      dialogues: Math.max(0, ...dlg, 0),
    };

    const p95 = {
      product_view: quantile(pv, 0.95),
      add_to_cart: quantile(atc, 0.95),
      purchase_completed: quantile(pc, 0.95),
      reviews: quantile(rv, 0.95),
      subscriptions: quantile(sub, 0.95),
      dialogues: quantile(dlg, 0.95),
    };

    return Response.json({ ok: true, count_profiles: files.length, max, p95 });
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error)?.message || String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}


