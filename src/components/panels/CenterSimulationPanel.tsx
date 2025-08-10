"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { User as UserIcon, X as CloseIcon } from "lucide-react";



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
      } catch { }
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
    const size = 14;
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
      console.log('data', data);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
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
    <Card className="h-full border-0 rounded-none bg-transparent">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-xl border border-zinc-800 bg-neutral-950/90 p-5 shadow-2xl">
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

              <div className="mt-4">
                {modalLoading ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                    Loading…
                  </div>
                ) : modalData ? (
                  <div className="space-y-2 text-sm">
                    {modalData.summary && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">summary</div>
                        <div className="mt-2 whitespace-pre-wrap leading-relaxed text-zinc-200">
                          {modalData.summary}
                        </div>
                      </div>
                    )}
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
