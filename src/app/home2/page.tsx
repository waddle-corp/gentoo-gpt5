"use client";

import React, { useMemo } from "react";
import simulatorPrompts from "@/data/simulator_prompts.json";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type SimulatorRecord = {
  user_id: string;
  summary: string;
  prompt: string;
  engagement_score: number;
};

export default function Home2ShadcnChartPage() {
  const data = simulatorPrompts as SimulatorRecord[];

  const histogramData = useMemo(() => {
    const scoreToCount = new Map<number, number>();
    for (const rec of data) {
      const score = rec.engagement_score;
      scoreToCount.set(score, (scoreToCount.get(score) ?? 0) + 1);
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
            <CardTitle className="text-lg sm:text-xl">Engagement Score 분포</CardTitle>
            <CardDescription>X축: engagement_score, Y축: 사용자 수</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ count: { label: "사용자 수", color: "#22d3ee" } }}
              className="w-full h-[420px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogramData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="score" type="number" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={ChartTooltipContent} />
                  <Bar dataKey="count" name="사용자 수" fill="var(--chart-count, #22d3ee)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}


