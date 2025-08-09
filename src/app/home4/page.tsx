"use client";

import React, { useMemo } from "react";
import simulatorPrompts from "@/data/simulator_prompts.json";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";

type SimulatorRecord = {
  user_id: string;
  summary: string;
  prompt: string;
  engagement_score: number;
};

export default function Home4ScatterDistributionPage() {
  const data = simulatorPrompts as SimulatorRecord[];

  const points = useMemo(() => {
    const scoreToCount = new Map<number, number>();
    for (const rec of data) {
      const s = rec.engagement_score;
      scoreToCount.set(s, (scoreToCount.get(s) ?? 0) + 1);
    }
    return Array.from(scoreToCount.entries())
      .map(([score, count]) => ({ x: score, y: count }))
      .sort((a, b) => a.x - b.x);
  }, [data]);

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 bg-background">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Engagement Score 분포 (Scatter)</CardTitle>
            <CardDescription>X축: engagement_score, Y축: 사용자 수</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ count: { label: "사용자 수", color: "#f59e0b" } }} className="w-full h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} name="score" />
                  <YAxis type="number" dataKey="y" allowDecimals={false} tickLine={false} axisLine={false} name="users" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter name="분포" data={points} fill="var(--chart-count, #f59e0b)" />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}


