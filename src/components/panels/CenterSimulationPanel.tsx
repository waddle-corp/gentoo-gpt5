"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";


type BubbleState = "unknown" | "positive" | "negative" | "pending";

export default function CenterSimulationPanel() {
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<null | { count: number; output: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [hist, setHist] = useState<Array<{ score: number; count: number }>>([]);
  const [promptsCount, setPromptsCount] = useState(0);
  const [query, setQuery] = useState("");
  const [bubbles, setBubbles] = useState<BubbleState[]>([]);

  async function runSimulation(limit?: number) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setLastRun({ count: data.count, output: data.output });
      await loadHistogram();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadHistogram() {
    try {
      setError(null);
      const res = await fetch("/api/simulate?hist=1", { method: "GET" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setHist(Array.isArray(data.histogram) ? data.histogram : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function loadPromptsMeta() {
    try {
      const res = await fetch("/api/simulate?prompts=1", { method: "GET" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const count = Number(data.count) || 0;
      setPromptsCount(count);
      setBubbles(new Array(count).fill("unknown"));
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    loadPromptsMeta();
  }, []);

  async function evaluateAll() {
    if (!query.trim() || promptsCount === 0) return;
    // set all to pending
    setBubbles((prev) => prev.map(() => "pending"));
    try {
      const res = await fetch("/api/eval-sentiment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !Array.isArray(data.results)) throw new Error(data?.error || `HTTP ${res.status}`);
      const mapped: BubbleState[] = data.results.map((v: string) => (v === "positive" ? "positive" : v === "negative" ? "negative" : "unknown"));
      // ensure length
      const padded = mapped.length < promptsCount ? mapped.concat(new Array(promptsCount - mapped.length).fill("unknown")) : mapped.slice(0, promptsCount);
      setBubbles(padded);
    } catch (e: any) {
      setError(e?.message || String(e));
      setBubbles((prev) => prev.map(() => "unknown"));
    }
  }

  const renderBubble = (state: BubbleState, idx: number) => {
    const size = 18;
    const base = "inline-flex items-center justify-center rounded-full border-2 mr-1 mb-1";
    const style: React.CSSProperties = { width: size, height: size };
    let cls = "border-gray-400";
    let inner: React.ReactNode = null;
    if (state === "unknown") cls = "border-gray-400";
    if (state === "pending") cls = "border-gray-300 animate-pulse";
    if (state === "positive") {
      cls = "border-emerald-600 bg-emerald-500";
      inner = <span className="sr-only">positive</span>;
    }
    if (state === "negative") {
      cls = "border-rose-500";
      // hollow red circle
    }
    return <span key={idx} className={`${base} ${cls}`} style={style}>{inner}</span>;
  };

  const maxY = useMemo(() => (hist.length ? Math.max(...hist.map((d) => d.count)) : 0), [hist]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Simulation Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            onClick={() => runSimulation()}
            disabled={loading}
          >
            {loading ? "Running..." : "Run Simulation (all)"}
          </button>
          <button
            className="px-3 py-2 rounded-md border"
            onClick={() => runSimulation(20)}
            disabled={loading}
          >
            {loading ? "..." : "Run 20"}
          </button>
          <button
            className="px-3 py-2 rounded-md border"
            onClick={() => loadHistogram()}
            disabled={loading}
          >
            Reload Histogram
          </button>
        </div>

        {error && <div className="text-sm text-red-500">에러: {error}</div>}
        {lastRun && (
          <div className="text-sm">
            생성됨: {lastRun.count}개
            <div className="text-xs text-muted-foreground break-all">{lastRun.output}</div>
          </div>
        )}

        <div className="mt-2">
          <ChartContainer
            className="w-full h-[300px]"
            config={{ count: { label: "Count", color: "hsl(var(--primary))" } }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="score" tick={{ fontSize: 10 }} interval={0} />
                <YAxis domain={[0, Math.max(5, maxY)]} tick={{ fontSize: 10 }} allowDecimals={false} />
                <Bar dataKey="count" fill="var(--chart-count)" radius={[3, 3, 0, 0]} />
                <ChartTooltip />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="text-xs text-muted-foreground mt-1">가로축: engagement score (1~30)</div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Enter a question to evaluate all prompts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <Button onClick={evaluateAll} disabled={loading || promptsCount === 0}>
            {loading ? "Evaluating..." : "Evaluate All"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {bubbles.map((state, idx) => renderBubble(state, idx))}
        </div>
      </CardContent>
    </Card>
  );
}
