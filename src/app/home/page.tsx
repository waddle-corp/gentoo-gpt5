"use client";

import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import simulatorPrompts from "@/data/simulator_prompts.json";

type SimulatorRecord = {
  user_id: string;
  summary: string;
  prompt: string;
  engagement_score: number;
};

export default function HomeEngagementDistributionPage() {
  const data = simulatorPrompts as SimulatorRecord[];

  const histogramData = useMemo(() => {
    const scoreToCount = new Map<number, number>();
    for (const rec of data) {
      const score = rec.engagement_score;
      scoreToCount.set(score, (scoreToCount.get(score) ?? 0) + 1);
    }

    const rows = Array.from(scoreToCount.entries())
      .map(([score, count]) => ({ score, count }))
      .sort((a, b) => a.score - b.score);

    return rows;
  }, [data]);

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 bg-background">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-semibold">Engagement Score 분포</h1>
          <p className="text-sm text-muted-foreground">
            X축: engagement_score, Y축: 사용자 수
          </p>
        </header>

        <section className="w-full h-[420px] rounded-md border bg-card p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="score"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="count" name="사용자 수" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
    </main>
  );
}


