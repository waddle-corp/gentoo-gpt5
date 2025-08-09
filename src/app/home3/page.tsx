"use client";

import React, { useMemo } from "react";
import simulatorPrompts from "@/data/simulator_prompts.json";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type SimulatorRecord = {
  user_id: string;
  summary: string;
  prompt: string;
  engagement_score: number;
};

export default function Home3AreaDistributionPage() {
  const data = simulatorPrompts as SimulatorRecord[];

  // 동일한 분포 데이터를 area로 시각화하기 위해 score별 count를 만든 후 면적그래프로 표현
  const histogramData = useMemo(() => {
    const scoreToCount = new Map<number, number>();
    for (const rec of data) {
      const s = rec.engagement_score;
      scoreToCount.set(s, (scoreToCount.get(s) ?? 0) + 1);
    }
    return Array.from(scoreToCount.entries())
      .map(([score, count]) => ({ score, count }))
      .sort((a, b) => a.score - b.score);
  }, [data]);

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 bg-background">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Engagement Score 분포 (Area)</CardTitle>
            <CardDescription>X축: engagement_score, Y축: 사용자 수</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ count: { label: "사용자 수", color: "#60a5fa" } }} className="w-full h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={histogramData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <defs>
                    <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-count, #60a5fa)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--chart-count, #60a5fa)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="score" type="number" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={ChartTooltipContent} />
                  <Area type="monotone" dataKey="count" name="사용자 수" stroke="var(--chart-count, #60a5fa)" fill="url(#fillCount)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}


