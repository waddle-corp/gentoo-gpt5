"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type BubbleState = "unknown" | "positive" | "negative" | "pending";

function Bubble({ state }: { state: BubbleState }) {
  const size = 12;
  const style: React.CSSProperties = { width: size, height: size } as any;
  let cls = "border-2 rounded-full";
  if (state === "positive") cls += " border-emerald-600 bg-emerald-500";
  else if (state === "negative") cls += " border-rose-500 bg-transparent";
  else cls += " border-gray-500 bg-gray-400";
  return <span className={`inline-block ${cls}`} style={style} />;
}

function EngagementColumn({ score, indices, bubbles }: { score: number; indices: number[]; bubbles: BubbleState[] }) {
  const maxPerSubCol = 10;
  const numSubCols = Math.max(1, Math.ceil(indices.length / maxPerSubCol));
  const subCols: number[][] = Array.from({ length: numSubCols }, (_, c) => indices.slice(c * maxPerSubCol, (c + 1) * maxPerSubCol));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-end gap-1">
        {subCols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1 justify-end">
            {col.map((i) => (
              <Bubble key={i} state={bubbles[i] ?? "unknown"} />
            ))}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground">{score}</div>
    </div>
  );
}

export default function StatsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [bubbles, setBubbles] = useState<Array<BubbleState>>([]);
  const [groups, setGroups] = useState<number[][]>([]);
  const [generating, setGenerating] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function onGenerate() {
      setIsOpen(true);
      setShowChart(false);
      setGenerating(false);
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("generate-stats", onGenerate as EventListener);
    function onOpenGraph(e: CustomEvent) {
      const detail = (e as any).detail || {};
      const nextBubbles = Array.isArray(detail.bubbles) ? (detail.bubbles as BubbleState[]) : [];
      const nextGroups = Array.isArray(detail.groups) ? (detail.groups as number[][]) : [];
      setBubbles(nextBubbles);
      setGroups(nextGroups);
      setShowChart(true);
    }
    window.addEventListener("open-engagement-graph", onOpenGraph as EventListener);
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("generate-stats", onGenerate as EventListener);
      window.removeEventListener("open-engagement-graph", onOpenGraph as EventListener);
      window.removeEventListener("keydown", onKeydown);
    };
  }, [close]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" aria-hidden={false} role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      {/* Centered container */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Card className="w-full max-w-[80vw] bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Generate Digital Clones</CardTitle>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={close}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {!showChart ? (
              <div className="min-h-[384px] flex items-center justify-center">
                {generating ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                    Generating...
                  </div>
                ) : (
                  <Button
                    aria-label="Generate"
                    className="px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                    onClick={async () => {
                      setGenerating(true);
                      // Ask Center panel for current board data immediately
                      window.dispatchEvent(new CustomEvent("request-engagement-graph"));
                      // Fallback: if no response arrives quickly, build groups from prompts and use unknown bubbles
                      setTimeout(async () => {
                        if (groups.length === 0 || bubbles.length === 0) {
                          try {
                            const res = await fetch("/api/simulate?prompts=1");
                            const data = await res.json();
                            if (res.ok && data?.ok && Array.isArray(data.prompts)) {
                              const list = data.prompts as Array<{ idx: number; engagement_score: number }>;
                              const g: number[][] = Array.from({ length: 30 }, () => []);
                              for (const meta of list) {
                                const s = Math.max(1, Math.min(30, Number(meta.engagement_score) || 1));
                                g[s - 1].push(meta.idx);
                              }
                              setGroups(g.map(arr => arr.slice()));
                              const maxIdx = list.length;
                              setBubbles(Array.from({ length: maxIdx }, () => "unknown" as BubbleState));
                            }
                          } catch {}
                        }
                      }, 200);
                      // Show chart after ~5s loading delay
                      setTimeout(() => {
                        setShowChart(true);
                        setGenerating(false);
                      }, 5000);
                    }}
                  >
                    Generate
                  </Button>
                )}
              </div>
            ) : (
              <div className="min-h-[384px] flex items-center justify-center overflow-x-auto">
                <div className="w-max">
                  <div className="flex items-end gap-2">
                    {groups.map((indices, idx) => (
                      <EngagementColumn key={idx} score={idx + 1} indices={indices} bubbles={bubbles} />
                    ))}
                  </div>
                  <div className="mt-2 text-[12px] text-muted-foreground text-center">Engagement Score (1~30)</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


