"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { User as UserIcon, X as CloseIcon } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContentProps } from "@/components/ui/chart";
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

type BubbleState = "unknown" | "positive" | "negative" | "pending";

type PromptMeta = { idx: number; user_id: string; engagement_score: number };

type Board = {
  name: string;
  bubbles: BubbleState[];
};

export default function CenterSimulationPanel() {
  const [error, setError] = useState<string | null>(null);
  const [promptsCount, setPromptsCount] = useState(0);
  const [promptsMeta, setPromptsMeta] = useState<PromptMeta[]>([]);
  const [boards, setBoards] = useState<Board[]>([{ name: "All", bubbles: [] }]);
  const [active, setActive] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState<{ user_id: string; summary?: string; prompt?: string; engagement_score?: number } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<{
    event_counts: Record<string, number>;
    reviews_count: number;
    review_titles: string[];
    reviews_detail?: Array<{ title: string; content: string; rating?: number }>;
    dialogues_total: number;
    dialogues_user_count: number;
    subscriptions_count?: number;
    add_to_cart_qty_total?: number;
    add_to_cart_value_total?: number;
    purchase_amounts?: number[];
    normalized_engagement_score?: number;
  } | null>(null);
  const [norms, setNorms] = useState<{
    max?: Record<string, number>;
    p95?: Record<string, number>;
  } | null>(null);

  const RADAR_MIN = 0.1;
  function buildRadarData(p: NonNullable<typeof profile>) {
    const c = p?.event_counts || {};
    const base = [
      { key: "product_view", subject: "product_view", raw: c["product_view"] || 0 },
      { key: "add_to_cart", subject: "add_to_cart", raw: c["add_to_cart"] || 0 },
      { key: "purchase_completed", subject: "purchase_completed", raw: c["purchase_completed"] || 0 },
      { key: "reviews", subject: "reviews", raw: p?.reviews_count || 0 },
      { key: "subscriptions", subject: "subscriptions", raw: p?.subscriptions_count || 0 },
      { key: "dialogues", subject: "dialogues", raw: p?.dialogues_total || 0 },
    ] as Array<{ key: string; subject: string; raw: number }>;
    // engagement-based scaling: normalize by global [0,1] then multiply by user's engagement factor (0..1)
    const denom = norms?.p95 || norms?.max || {};
    const engagementFactor = Math.min(1, Math.max(0, (p?.normalized_engagement_score ?? 0) / 30));
    return base.map((d) => {
      const dnm = Math.max(1, Number((denom as any)[d.key] ?? 1));
      const ratio = Math.min(1, d.raw / dnm) * engagementFactor;
      const A = ratio === 0 ? RADAR_MIN : Math.max(RADAR_MIN, ratio);
      return { subject: d.subject, raw: d.raw, A };
    });
  }

  function RadarTooltipContent({ active, payload }: ChartTooltipContentProps) {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0];
    const subj = (p as any)?.payload?.subject;
    const raw = (p as any)?.payload?.raw;
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow">
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">{String(subj)}</div>
        <div className="text-[12px]">value: {raw}</div>
      </div>
    );
  }

  async function loadPromptsMeta() {
    try {
      const res = await fetch("/api/simulate?prompts=1", { method: "GET" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const list: PromptMeta[] = Array.isArray(data.prompts) ? data.prompts : [];
      setPromptsMeta(list);
      setPromptsCount(list.length);
      setBoards([{ name: "All", bubbles: new Array(list.length).fill("unknown") }]);
      setActive(0);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    loadPromptsMeta();
  }, []);

  useEffect(() => {
    function onEvalResults(e: any) {
      try {
        const lists: string[][] = Array.isArray(e?.detail?.resultsList) ? e.detail.resultsList : [];
        const titles: string[] = Array.isArray(e?.detail?.titles) ? e.detail.titles : [];
        if (!lists.length) return;

        const boardsFromLists: Board[] = lists.map((arr, idx) => {
          const mapped = arr.map((v) => (v === "positive" ? "positive" : v === "negative" ? "negative" : "unknown")) as BubbleState[];
          const padded = mapped.length < promptsCount ? mapped.concat(new Array(promptsCount - mapped.length).fill("unknown")) : mapped.slice(0, promptsCount);
          return { name: titles[idx] || `H${idx + 1}`, bubbles: padded };
        });
        const newBoards = [{ name: "All", bubbles: boardsFromLists[0].bubbles }, ...boardsFromLists];
        setBoards(newBoards);
        setActive(1);
        // 시뮬 결과 기반 인사이트 호출 (All 보드 기준)
        setHasSimulated(true);
        loadInsightsFor(boardsFromLists[0].bubbles);
      } catch {}
    }
    window.addEventListener("eval-results", onEvalResults as EventListener);
    return () => window.removeEventListener("eval-results", onEvalResults as EventListener);
  }, [promptsCount]);

  const groupedByScore = (b: BubbleState[]) => {
    const groups: number[][] = Array.from({ length: 30 }, () => []);
    for (const meta of promptsMeta) {
      const s = Math.max(1, Math.min(30, Number(meta.engagement_score) || 1));
      groups[s - 1].push(meta.idx);
    }
    return groups.map((indices) => indices.map((i) => i));
  };

  const renderBubble = (state: BubbleState, idx: number) => {
    const size = 12;
    const style: React.CSSProperties = { width: size, height: size, cursor: "pointer" };
    let cls = "border-2 rounded-full";
    if (state === "unknown") cls += " border-gray-500 bg-gray-400";
    else if (state === "pending") cls += " border-gray-300 bg-gray-200 animate-pulse";
    else if (state === "positive") cls += " border-emerald-600 bg-emerald-500";
    else if (state === "negative") cls += " border-rose-500 bg-transparent";
    return <span key={`b-${idx}-${state}`} className={cls} style={style} onClick={() => openModalFor(idx)} />;
  };

  async function openModalFor(index: number) {
    try {
      setModalLoading(true);
      setModalOpen(true);
      setModalData(null);
      setProfile(null);
      setProfileLoading(true);
      const res = await fetch(`/api/prompts?idx=${index}`);
      const data = await res.json();
      console.log('data', data);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setModalData({ user_id: data.user_id, summary: data.summary, prompt: data.prompt, engagement_score: data.engagement_score });

      // Load profile info in background
      const pRes = await fetch(`/api/user-profile?user_id=${encodeURIComponent(data.user_id)}`);
      const pData = await pRes.json();
      if (pRes.ok && pData?.ok) {
        setProfile({
          event_counts: pData.event_counts || {},
          reviews_count: Number(pData.reviews_count || 0),
          review_titles: Array.isArray(pData.review_titles) ? pData.review_titles : [],
          reviews_detail: Array.isArray(pData.reviews_detail) ? pData.reviews_detail : [],
          dialogues_total: Number(pData.dialogues_total || 0),
          dialogues_user_count: Number(pData.dialogues_user_count || 0),
          subscriptions_count: Number(pData.subscriptions_count || 0),
          add_to_cart_qty_total: Number(pData.add_to_cart_qty_total || 0),
          add_to_cart_value_total: Number(pData.add_to_cart_value_total || 0),
          purchase_amounts: Array.isArray(pData.purchase_amounts) ? pData.purchase_amounts : [],
          normalized_engagement_score: Number(pData.normalized_engagement_score || 0),
        });
      }
      // fetch global normalization metrics (best-effort)
      try {
        const nRes = await fetch(`/api/user-profile/metrics`);
        const nData = await nRes.json();
        if (nRes.ok && nData?.ok) setNorms({ max: nData.max, p95: nData.p95 });
      } catch {}
    } catch (e: any) {
      setModalData({ user_id: String(index), summary: `Failed to load summary: ${e?.message || String(e)}` });
    } finally {
      setModalLoading(false);
      setProfileLoading(false);
    }
  }

  const renderColumn = (score: number, indices: number[], bubbles: BubbleState[]) => {
    const maxPerSubCol = 10;
    const numSubCols = Math.max(1, Math.ceil(indices.length / maxPerSubCol));
    const subCols: number[][] = Array.from({ length: numSubCols }, (_, c) =>
      indices.slice(c * maxPerSubCol, (c + 1) * maxPerSubCol)
    );

    return (
      <div key={`col-${score}`} className="flex flex-col items-center gap-1">
        <div className="flex items-end gap-1">
          {subCols.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-1 justify-end">
              {col.map((i) => renderBubble(bubbles[i] ?? "unknown", i))}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground">{score}</div>
      </div>
    );
  };

  const activeBubbles = boards[active]?.bubbles || [];

  const legend = useMemo(() => {
    let p = 0, n = 0, u = 0;
    for (const s of activeBubbles) {
      if (s === "positive") p++; else if (s === "negative") n++; else u++;
    }
    return { p, n, u, total: activeBubbles.length };
  }, [activeBubbles]);

  function summarizeFor(bubbles: BubbleState[]) {
    const stats = { p: 0, n: 0, u: 0, total: bubbles.length } as any;
    for (const s of bubbles) {
      if (s === "positive") stats.p++; else if (s === "negative") stats.n++; else stats.u++;
    }
    const byScore: Array<{ score: number; positive: number; negative: number; unknown: number }> = [];
    const groups = groupedByScore(bubbles);
    for (let i = 0; i < groups.length; i++) {
      const indices = groups[i];
      let cp = 0, cn = 0, cu = 0;
      for (const idx of indices) {
        const s = bubbles[idx] ?? "unknown";
        if (s === "positive") cp++; else if (s === "negative") cn++; else cu++;
      }
      byScore.push({ score: i + 1, positive: cp, negative: cn, unknown: cu });
    }
    return { stats, byScore };
  }

  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [insightsCache, setInsightsCache] = useState<Record<string, string>>({});

  function mdToHtml(md: string): string {
    const esc = (md || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // bold **text**
    let s = esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const lines = s.split("\n");
    let html = "";
    let inList = false;
    for (const raw of lines) {
      const line = raw || "";
      const h = line.match(/^\s*(#{1,6})\s+(.*)$/); // headings
      const bullet = line.match(/^\s*[-\*]\s+(.*)$/); // bullets - or *

      if (h) {
        if (inList) { html += "</ul>"; inList = false; }
        const level = Math.min(6, Math.max(1, h[1].length));
        const content = h[2].trim();
        const tag = `h${level}`;
        html += `<${tag} class=\"mt-1 mb-1 text-[13px] font-semibold\">${content}</${tag}>`;
        continue;
      }

      if (bullet) {
        if (!inList) { html += '<ul class="list-disc pl-5 mb-1">'; inList = true; }
        html += `<li>${bullet[1]}</li>`;
        continue;
      }

      if (inList) { html += "</ul>"; inList = false; }
      const t = line.trim();
      if (t.length) html += `<p class=\"mb-1\">${t}</p>`;
    }
    if (inList) html += "</ul>";
    return html;
  }

  async function loadInsightsFor(bubbles: BubbleState[]) {
    try {
      setInsightsLoading(true);
      const { stats, byScore } = summarizeFor(bubbles);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stats, byScore }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const html = mdToHtml(data.insights as string);
      setInsights(html);
      const key = boards[active]?.name || "All";
      setInsightsCache((prev) => ({ ...prev, [key]: html }));
    } catch (e) {
      // Fallback: 간단한 휴리스틱 인사이트
      const { stats, byScore } = summarizeFor(bubbles);
      const top = [...byScore].sort((a, b) => (b.positive - b.negative) - (a.positive - a.negative)).slice(0, 2);
      const low = [...byScore].sort((a, b) => (a.positive - a.negative) - (b.positive - b.negative)).slice(0, 1);
      const md = [
        `- **Positives**: ${stats.p}/${stats.total}, **Negatives**: ${stats.n}, **Unknown**: ${stats.u}`,
        top.length ? `- High potential bins: ${top.map((t) => `${t.score}`).join(", ")}` : "",
        low.length ? `- Weak bin: ${low.map((t) => `${t.score}`).join(", ")}` : "",
        `- Next actions: drill-down high bins; inspect negatives; rerun with refined cohorts.`,
      ].filter(Boolean).join("\n");
      const html = mdToHtml(md);
      setInsights(html);
      const key = boards[active]?.name || "All";
      setInsightsCache((prev) => ({ ...prev, [key]: html }));
    } finally {
      setInsightsLoading(false);
    }
  }

  useEffect(() => {
    if (!hasSimulated) return;
    // 캐시에 있으면 재사용, 없으면 생성
    const key = boards[active]?.name || `B${active}`;
    const cached = insightsCache[key];
    if (cached) {
      setInsights(cached);
      setInsightsLoading(false);
    } else if (activeBubbles.length > 0) {
      loadInsightsFor(activeBubbles);
    }
  }, [activeBubbles, hasSimulated, active, boards, insightsCache]);

  return (
    <Card className="h-full border-0 rounded-none bg-transparent gap-5">
      <CardHeader className="py-1.5">
        <CardTitle>Simulation Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 min-h-0">
        <div className="flex items-center gap-1.5">
          {boards.map((b, i) => (
            <button key={i} onClick={() => setActive(i)} className={`px-3 py-1 rounded-md text-sm ${i === active ? "bg-primary text-primary-foreground" : "border"}`}>
              {b.name}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground flex items-center gap-2.5 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-emerald-600 bg-emerald-500" />
              <span>Positive</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-rose-500 bg-transparent" />
              <span>Negative</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-500 bg-gray-400" />
              <span>Unknown</span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="w-max">
              <div className="flex items-end gap-2">
                {groupedByScore(boards[active]?.bubbles || []).map((indices, idx) => renderColumn(idx + 1, indices, boards[active]?.bubbles || []))}
              </div>
              <div className="mt-2 text-[12px] text-muted-foreground text-center">Engagement Score (1~30)</div>
            </div>
          </div>
        </div>

        {/* Insights */}
        {hasSimulated && (
          <div className="rounded-md border text-sm bg-card/50">
            <div className="px-3 pt-3 text-xs text-muted-foreground">Insights</div>
            <div className="h-48 overflow-y-auto overscroll-contain px-3 pb-3">
              {insightsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  Generating insights…
                </div>
              ) : (
                <div className="text-sm leading-5" dangerouslySetInnerHTML={{ __html: insights || "<p class=\"text-muted-foreground\">No insights yet.</p>" }} />
              )}
            </div>
          </div>
        )}

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-4xl rounded-xl border border-zinc-800 bg-neutral-950/90 p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="shrink-0">
                    <div className="size-12 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 p-[2px]">
                      <div className="grid size-full place-items-center rounded-full bg-neutral-950">
                        <UserIcon className="size-6 text-zinc-300" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">{modalData?.user_id ?? "User"}</div>
                    {modalData?.engagement_score !== undefined && (
                      <div className="mt-1 text-xs text-zinc-400">
                        engagement
                        <span
                          className={`ml-2 inline-flex items-center rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] ${
                            (modalData?.engagement_score ?? 0) >= 20
                              ? "bg-emerald-500/10 text-emerald-400"
                              : (modalData?.engagement_score ?? 0) >= 10
                              ? "bg-sky-500/10 text-sky-400"
                              : "bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {modalData?.engagement_score}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="rounded-md p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                >
                  <CloseIcon className="size-4" />
                </button>
              </div>

              <div className="mt-5 space-y-6">
                {modalLoading ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                    Loading…
                  </div>
                ) : modalData ? (
                  <div className="space-y-4 text-sm">
                    {modalData.summary && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">summary</div>
                        <div className="mt-2 whitespace-pre-wrap leading-relaxed text-zinc-200">
                          {modalData.summary}
                        </div>
                      </div>
                    )}

                    {/* Badges section */}
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-wide text-zinc-500">event types & counts</div>
                      <div className="flex flex-wrap gap-2">
                        {/* Activities counts */}
                        {profile && Object.keys(profile.event_counts).length > 0 &&
                          Object.entries(profile.event_counts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([name, count]) => (
                              <span key={name} className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-200">
                                <span className="text-zinc-400">{name}</span>
                                <span className="ml-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{count}</span>
                              </span>
                            ))}

                        {/* Reviews count */}
                        {profile && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-200">
                            <span className="text-zinc-400">reviews</span>
                            <span className="ml-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{profile.reviews_count}</span>
                          </span>
                        )}

                        {/* Dialogues badge (user only) */}
                        {profile && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-200">
                            <span className="text-zinc-400">dialogues(user)</span>
                            <span className="ml-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{profile.dialogues_user_count}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Radar chart (fixed 6 axes) */}
                    {profile && (
                      <div className="mt-2">
                        <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">behavior radar</div>
                        <ChartContainer
                          className="h-[260px] w-full"
                          config={{ a: { label: "count", color: "#22d3ee" } }}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                              <RadarChart data={buildRadarData(profile)}>
                              <PolarGrid />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                              <PolarRadiusAxis domain={[0, 1]} tickCount={5} tickFormatter={(v: any) => `${v}`} tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                              <Radar dataKey="A" stroke="var(--chart-a)" fill="var(--chart-a)" fillOpacity={0.2} />
                              <ChartTooltip cursor={false} content={RadarTooltipContent} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                        {/* Reviews (card style) */}
                        <div className="mt-6">
                          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">reviews</div>
                          {profile?.reviews_detail && profile.reviews_detail.length > 0 ? (
                            <div className="flex max-h-56 flex-col gap-3 overflow-auto pr-1">
                              {profile.reviews_detail.map((r, i) => (
                                <div key={`rev-card-${i}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="text-[13px] font-medium text-zinc-100">“{r.title || "(no title)"}”</div>
                                    {typeof r.rating === "number" && (
                                      <div className="shrink-0 text-[12px]">
                                        {Array.from({ length: 5 }).map((_, idx) => (
                                          <span key={idx} className={idx < (r.rating ?? 0) ? "text-amber-400" : "text-zinc-600"}>★</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {r.content && (
                                    <div className="mt-1 text-[12px] leading-relaxed text-zinc-300">{r.content}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[12px] text-zinc-500">No reviews.</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/**
                     * Cart & Purchase totals (hidden for now)
                     * Later use:
                     *  - cart totals badges
                     *  - horizontal bar chart comparing cart vs purchase totals
                     */}
                  </div>
                ) : (
                  <div className="text-sm text-destructive">No data</div>
                )}
              </div>
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-500">에러: {error}</div>}
      </CardContent>
    </Card>
  );
}
