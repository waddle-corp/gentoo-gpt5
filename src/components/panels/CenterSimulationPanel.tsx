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
        setBoards([{ name: "All", bubbles: boardsFromLists[0].bubbles }, ...boardsFromLists]);
        setActive(1);
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
    const size = 16;
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
    return (
      <div key={`col-${score}`} className="flex flex-col items-center gap-1">
        <div className="flex flex-col gap-1 justify-end h-64">
          {indices.map((i) => renderBubble(bubbles[i] ?? "unknown", i))}
        </div>
        <div className="text-[10px] text-muted-foreground">{score}</div>
      </div>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Simulation Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          {boards.map((b, i) => (
            <button key={i} onClick={() => setActive(i)} className={`px-3 py-1 rounded-md text-sm ${i === active ? "bg-primary text-primary-foreground" : "border"}`}>
              {b.name}
            </button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground">가로축: engagement score (1~30), 원: 각 사용자 — 초록(Positive, 채움) / 빨강(비어있음, Negative) / 회색(Unknown)</div>
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex items-end gap-2">
              {groupedByScore(boards[active]?.bubbles || []).map((indices, idx) => renderColumn(idx + 1, indices, boards[active]?.bubbles || []))}
            </div>
          </div>
        </div>

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
