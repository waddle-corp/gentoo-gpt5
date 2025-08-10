"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";



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
      const res = await fetch(`/api/prompts?idx=${index}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setModalData({ user_id: data.user_id, summary: data.summary, prompt: data.prompt, engagement_score: data.engagement_score });
    } catch (e: any) {
      setModalData({ user_id: String(index), summary: `Failed to load summary: ${e?.message || String(e)}` });
    } finally {
      setModalLoading(false);
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-md bg-background border p-4 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">User Detail</div>
                <button className="text-xs text-muted-foreground" onClick={() => setModalOpen(false)}>Close</button>
              </div>
              {modalLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  Loading…
                </div>
              ) : modalData ? (
                <div className="space-y-2 text-sm">
                  <div className="text-muted-foreground">user_id: <span className="text-foreground">{modalData.user_id}</span></div>
                  {modalData.engagement_score !== undefined && (
                    <div className="text-muted-foreground">engagement: <span className="text-foreground">{modalData.engagement_score}</span></div>
                  )}
                  {modalData.summary && (
                    <div>
                      <div className="text-muted-foreground">summary</div>
                      <div className="mt-1 whitespace-pre-wrap">{modalData.summary}</div>
                    </div>
                  )}
                  {modalData.prompt && (
                    <div>
                      <div className="text-muted-foreground">prompt</div>
                      <div className="mt-1 whitespace-pre-wrap">{modalData.prompt}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-destructive">No data</div>
              )}
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-500">에러: {error}</div>}
      </CardContent>
    </Card>
  );
}
