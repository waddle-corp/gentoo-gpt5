"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BubbleState = "unknown" | "positive" | "negative" | "pending";
type PromptMeta = { idx: number; user_id: string; engagement_score: number };
type Board = { name: string; bubbles: BubbleState[] };

type Props = { embedded?: boolean };

export default function CenterSimulationPanel({ embedded }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [promptsCount, setPromptsCount] = useState(0);
  const [promptsMeta, setPromptsMeta] = useState<PromptMeta[]>([]);
  const [boards, setBoards] = useState<Board[]>([{ name: "All", bubbles: [] }]);
  const [active, setActive] = useState(0);

  // load prompts meta (always load to preserve functionality)
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

  // 이벤트 리스너: eval-results
  useEffect(() => {
    function onEvalResults(e: any) {
      try {
        const lists: string[][] = Array.isArray(e?.detail?.resultsList) ? e.detail.resultsList : [];
        const titles: string[] = Array.isArray(e?.detail?.titles) ? e.detail.titles : [];
        if (!lists.length) return;

        const boardsFromLists: Board[] = lists.map((arr, idx) => {
          const mapped = arr.map((v) =>
            v === "positive" ? "positive" : v === "negative" ? "negative" : "unknown"
          ) as BubbleState[];
          const padded =
            mapped.length < promptsCount
              ? mapped.concat(new Array(promptsCount - mapped.length).fill("unknown"))
              : mapped.slice(0, promptsCount);
          return { name: titles[idx] || `H${idx + 1}`, bubbles: padded };
        });

        const rep = boardsFromLists[0] ?? { name: "All", bubbles: new Array(promptsCount).fill("unknown") };
        setBoards([{ name: "All", bubbles: rep.bubbles }, ...boardsFromLists]);
        setActive(1);
      } catch (err) {
        // 안전하게 무시
      }
    }

    window.addEventListener("eval-results", onEvalResults as EventListener);
    return () => window.removeEventListener("eval-results", onEvalResults as EventListener);
  }, [promptsCount]);

  // grouping by engagement score (1..30)
  const groupedByScore = (bubbles: BubbleState[]) => {
    const groups: number[][] = Array.from({ length: 30 }, () => []);
    for (const meta of promptsMeta) {
      const s = Math.max(1, Math.min(30, Number(meta.engagement_score) || 1));
      groups[s - 1].push(meta.idx);
    }
    return groups;
  };

  const renderBubble = (state: BubbleState, idx: number) => {
    const size = 16;
    const style: React.CSSProperties = { width: size, height: size };
    let cls = "border-2 rounded-full inline-block";
    if (state === "unknown") cls += " border-gray-500 bg-gray-400";
    else if (state === "pending") cls += " border-gray-300 bg-gray-200 animate-pulse";
    else if (state === "positive") cls += " border-emerald-600 bg-emerald-500";
    else if (state === "negative") cls += " border-rose-500 bg-transparent";
    return <span key={`b-${idx}-${state}`} className={cls} style={style} />;
  };

  const renderColumn = (score: number, indices: number[], bubbles: BubbleState[]) => (
    <div key={`col-${score}`} className="flex flex-col items-center gap-1">
      <div className="flex flex-col gap-1 justify-end h-64">
        {indices.map((i) => renderBubble(bubbles[i] ?? "unknown", i))}
      </div>
      <div className="text-[10px] text-muted-foreground">{score}</div>
    </div>
  );

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="py-4 px-4 md:px-6">
        <CardTitle>Simulation Results</CardTitle>
      </CardHeader>

      <CardContent className="pb-4 px-4 md:px-6 space-y-4 min-h-0">
        <div className="flex items-center gap-2 flex-wrap">
          {boards.map((b, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`px-3 py-1 rounded-md text-sm ${i === active ? "bg-primary text-primary-foreground" : "border"}`}
            >
              {b.name}
            </button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground">
          가로축: engagement score (1~30), 원: 각 사용자 — 초록(Positive, 채움) / 빨강(비어있음, Negative) / 회색(Unknown)
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex items-end gap-2">
              {groupedByScore(boards[active]?.bubbles || []).map((indices, idx) =>
                renderColumn(idx + 1, indices, boards[active]?.bubbles || [])
              )}
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-red-500">에러: {error}</div>}
      </CardContent>
    </Card>
  );
}
